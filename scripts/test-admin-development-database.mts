// Owned, network-disabled PostgreSQL only. No credentials, remote target or output files.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createCleanRoom } from './database/clean-room.mts';
import {
  installDevelopmentBase,
  developmentDefinitions,
  developmentRealmSql,
  provisionDevelopmentFixture,
  verifyDevelopmentWorkflowUpgrade,
} from './database/admin-development-fixture.mts';
import { source } from './database/integration.mts';
import { buildAdminDevelopmentSql } from './build-admin-development-sql.mts';
import { errorOutput } from './database/contracts.mts';

assert.equal(process.argv.length, 2, 'No target overrides accepted');
const room = createCleanRoom();
const sql = (query: string) =>
  room.sql('set role postgres;set search_path=public,extensions;\n' + query);
const snapshot = () => developmentDefinitions(sql);
const id = (n: number) => `98000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const grantsSnapshot = () =>
  sql(`select md5(string_agg(p.oid::text||p.proowner::text||coalesce(p.proacl::text,''),'|' order by p.oid))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f'
 and n.nspname in ('public','auth','storage','portal_identity_private','business_private','staff_workflow_private');`);
const token = 'a'.repeat(43);
function call(
  persona: string | null,
  name: string,
  args: Record<string, unknown> = {},
  credential = token,
) {
  return JSON.parse(
    sql(`set session authorization doji_staging_development_login;set role doji_staging_development;
   select admin_development_private.invoke_v1('${createHash('sha256').update(credential).digest('hex')}',${persona ? `'${persona}'` : 'null'},
    '${name}',$args$${JSON.stringify(args)}$args$::jsonb,'${randomUUID()}');`),
  );
}
try {
  await room.start();
  await installDevelopmentBase(room);
  const baseline = snapshot();
  const baselineGrants = grantsSnapshot();
  const candidate = buildAdminDevelopmentSql(baseline);
  assert.throws(() => sql(candidate), /./, 'Absent staging realm refuses installation');
  sql(developmentRealmSql);
  sql(candidate);
  assert.equal(grantsSnapshot(), baselineGrants, 'Existing grants and ownership unchanged');
  sql(source('scripts/test-announcement-compose.sql'));
  console.log('PASS: existing authenticated employee and member announcement regression suite');
  assert.equal(sql('select enabled from admin_development_private.settings'), 'f');
  const after = snapshot();
  const patched: string[] = JSON.parse(
    sql('select jsonb_agg(signature) from admin_development_private.restore'),
  );
  assert.ok(patched.length > 5);
  console.log(
    `PASS: ${patched.length} exact-definition-pinned assurance gates; other functions unchanged`,
  );
  assert.deepEqual(
    after.filter((d) => !patched.includes(d.signature)),
    baseline.filter((d) => !patched.includes(d.signature)),
  );
  for (const role of [
    'anon',
    'authenticated',
    'service_role',
    'doji_employee',
    'doji_employee_application',
  ]) {
    assert.equal(
      sql(`select has_function_privilege('${role}',
      'admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid)','execute')`),
      'f',
    );
  }
  provisionDevelopmentFixture(sql);
  assert.throws(() => call(id(1), 'get_admin_portal_session_v3'));
  sql('update admin_development_private.settings set enabled=true');
  assert.equal(call(null, 'personas').personas.length, 2);
  assert.throws(() => call(id(1), 'get_admin_portal_session_v3', {}, 'b'.repeat(43)));
  assert.equal(call(id(1), 'get_admin_portal_session_v3').result.user_id, id(1));
  assert.equal(
    call(id(2), 'get_admin_portal_session_v3').result.capabilities.operations_read,
    false,
  );
  assert.equal(call(id(3), 'get_admin_portal_session_v3').code, '42501');
  assert.equal(call(id(2), 'get_admin_employee_directory_v1').ok, false);
  assert.equal(call(id(1), 'get_admin_employee_directory_v1').result.items.length, 3);
  assert.equal(call(id(1), 'unknown_rpc').code, '42501');
  assert.equal(call(id(1), 'get_admin_portal_session_v3', { actor: id(3) }).code, '22023');
  assert.equal(
    call(id(1), 'get_admin_editorial_page_v1', { p_kind: 'ideas', p_limit: 999 }).code,
    '22023',
  );
  console.log(
    'PASS: developer authentication, persona grants, server permissions and operation/argument bounds',
  );
  const payload = {
    p_action: 'save_draft',
    p_id: null,
    p_version: null,
    p_request_id: randomUUID(),
    p_input: {
      title: 'Synthetic development draft',
      body: 'Offline fixture',
      starts_at: '2030-01-01T00:00:00Z',
      ends_at: '2030-01-02T00:00:00Z',
      priority: 0,
      max_impressions_per_user: 1,
      min_hours_between_impressions: 24,
    },
  };
  const write = call(id(1), 'admin_announcement_compose_v1', payload);
  assert.equal(write.ok, true, JSON.stringify(write));
  assert.equal(call(id(1), 'admin_announcement_compose_v1', payload).result.replayed, true);
  assert.equal(sql('select count(*) from public.app_announcements'), '1');
  assert.equal(
    call(id(2), 'admin_announcement_compose_v1', { ...payload, p_request_id: randomUUID() }).ok,
    false,
  );
  assert.equal(sql('select count(*) from public.app_announcements'), '1');
  assert.equal(
    sql(`select bool_and(developer='developer-one' and credential_id='${id(10)}')
    from admin_development_private.audit`),
    't',
  );
  assert.equal(sql('select count(*) from admin_development_private.context'), '0');
  console.log(
    'PASS: actual atomic writes, identical replay, denied writes and durable dual-identity audit',
  );
  sql(`update admin_development_private.credentials set enabled=false`);
  assert.throws(() => call(id(1), 'get_admin_portal_session_v3'));
  sql(
    `update admin_development_private.credentials set enabled=true,expires_at=now()-interval '1 second'`,
  );
  assert.throws(() => call(id(1), 'get_admin_portal_session_v3'));
  sql(`update admin_development_private.credentials set expires_at=now()+interval '1 hour';
    update public.admin_employees set status='disabled' where id='${id(2)}'`);
  assert.equal(call(id(2), 'get_admin_portal_session_v3').code, '42501');
  sql(`insert into admin_development_private.credentials values('${id(11)}','developer-two',
    encode(extensions.digest('${'b'.repeat(43)}','sha256'),'hex'),now()+interval '1 hour',true);
    insert into admin_development_private.grants values('${id(11)}','${id(3)}');`);
  assert.equal(call(id(1), 'get_admin_portal_session_v3', {}, 'b'.repeat(43)).code, '42501');
  assert.equal(
    call(id(3), 'get_admin_portal_session_v3', {}, 'b'.repeat(43)).result.user_id,
    id(3),
  );
  sql(`delete from admin_development_private.grants where credential_id='${id(11)}'`);
  assert.equal(call(id(3), 'get_admin_portal_session_v3', {}, 'b'.repeat(43)).code, '42501');
  for (const aal of [null, 'aal1', 'staging_development', 'aal2']) {
    const claims = JSON.stringify({ sub: id(1), role: 'doji_employee', ...(aal ? { aal } : {}) });
    assert.equal(
      sql(`begin;set local request.jwt.claims='${claims}';
      select public.admin_user_has_permission('portal.session');rollback;`),
      aal === 'aal2' ? 't' : 'f',
    );
  }
  console.log(
    'PASS: immediate revocation, expiration, disabled personas and unchanged hosted assurance requirement',
  );
  const adapterBefore = sql(
    `select pg_get_functiondef('admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid)'::regprocedure)`,
  );
  sql(source('supabase/overlays/admin_development_employees_v2.sql'));
  assert.equal(
    sql('select bool_or(employee_directory_access) from admin_development_private.credentials'),
    'f',
  );
  assert.equal(call(id(3), 'get_admin_portal_session_v3').code, '42501');
  sql(`update admin_development_private.credentials set employee_directory_access=true where id='${id(10)}';
    select portal_identity_private.bind_identity('employee','user_directory_4','${id(4)}','Synthetic directory employee');
    select portal_identity_private.prepare_employee_actor_v1('${id(4)}','Synthetic directory actor');
    select portal_identity_private.set_principal_state('${id(4)}',1,'active','Synthetic directory activation');
    insert into public.admin_employees(id,display_name,status,roles) values('${id(4)}','Directory employee','active',array['moderator']);
    insert into portal_identity_private.employee_contacts(id,email,verified_at) values('${id(4)}','directory@test.invalid',now());`);
  assert.equal(
    sql(`select count(*) from admin_development_private.personas where id='${id(4)}'`),
    '0',
  );
  assert.ok(
    call(null, 'personas').personas.some(
      (p: { id: string; label: string }) =>
        p.id === id(4) && p.label === 'Directory employee · directory@test.invalid',
    ),
  );
  assert.equal(call(id(4), 'get_admin_portal_session_v3').result.user_id, id(4));
  assert.equal(
    call(id(4), 'get_admin_portal_session_v3').result.capabilities.operations_read,
    false,
  );
  assert.equal(call(id(4), 'get_admin_employee_directory_v1').ok, false);
  assert.equal(call(id(4), 'get_admin_portal_session_v3', {}, 'b'.repeat(43)).code, '42501');
  sql(`update public.admin_employees set display_name='Renamed employee' where id='${id(4)}'`);
  assert.ok(
    call(null, 'personas').personas.some((p: { label: string }) =>
      p.label.startsWith('Renamed employee'),
    ),
  );
  for (const [disable, restore] of [
    [
      `update public.admin_employees set status='disabled'`,
      `update public.admin_employees set status='active'`,
    ],
    [
      `update public.admin_employees set roles=array[]::text[]`,
      `update public.admin_employees set roles=array['moderator']`,
    ],
    [
      `update portal_identity_private.principals set state='disabled'`,
      `update portal_identity_private.principals set state='active'`,
    ],
  ]) {
    sql(`${disable} where id='${id(4)}'`);
    assert.equal(
      call(null, 'personas').personas.some((p: { id: string }) => p.id === id(4)),
      false,
    );
    assert.equal(call(id(4), 'get_admin_portal_session_v3').code, '42501');
    sql(`${restore} where id='${id(4)}'`);
  }
  sql(`update portal_identity_private.identities set revoked=true where principal_id='${id(4)}'`);
  assert.equal(call(id(4), 'get_admin_portal_session_v3').code, '42501');
  sql(`update portal_identity_private.identities set revoked=false where principal_id='${id(4)}';
    update admin_development_private.credentials set employee_directory_access=false where id='${id(10)}'`);
  assert.equal(call(id(4), 'get_admin_portal_session_v3').code, '42501');
  assert.equal(
    sql(
      `select count(*)>0 from admin_development_private.audit where persona_id='${id(4)}' and developer='developer-one'`,
    ),
    't',
  );
  const directoryAdapter = sql(
    `select pg_get_functiondef('admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid)'::regprocedure)`,
  );
  const sharedIssuer = 'https://api.workos.com/user_management/client_01M3VE4WTBYS2XN6NZPH9EDMQD';
  const sharedAudience = 'client_01M51GRQJVKXFZ98RG21MK7J64';
  sql(source('supabase/overlays/employee_shared_staging_v1.sql'));
  assert.equal(sql('select enabled from admin_development_private.settings'), 'f');
  assert.equal(sql('select enabled from employee_session_private.settings'), 'f');
  assert.equal(
    sql("select enabled from portal_identity_private.realms where realm='employee'"),
    'f',
  );
  assert.equal(
    sql("select bool_and(revoked) from portal_identity_private.identities where realm='employee'"),
    't',
  );
  assert.equal(sql("select tgenabled from pg_trigger where tgname='portal_realm_immutable'"), 'O');
  assert.throws(() =>
    sql("update portal_identity_private.realms set audience='wrong' where realm='employee'"),
  );
  assert.throws(() => call(id(1), 'get_admin_portal_session_v3'));
  sql(`select portal_identity_private.bind_identity('employee','user_shared_fixture','${id(5)}','Synthetic shared directory mapping');
    select portal_identity_private.prepare_employee_actor_v1('${id(5)}','Synthetic shared actor');
    select portal_identity_private.set_principal_state('${id(5)}',1,'active','Synthetic shared activation');
    insert into public.admin_employees(id,display_name,status,roles) values('${id(5)}','Shared employee','active',array['super_admin']);
    insert into portal_identity_private.employee_contacts(id,email,verified_at) values('${id(5)}','shared@test.invalid',now());
    update portal_identity_private.realms set enabled=true where realm='employee';
    update admin_development_private.credentials set employee_directory_access=true where id='${id(10)}';
    update admin_development_private.settings set enabled=true;`);
  assert.deepEqual(
    call(null, 'personas').personas.map((p: { id: string }) => p.id),
    [id(5)],
  );
  assert.equal(call(id(5), 'get_admin_portal_session_v3').result.user_id, id(5));
  assert.equal(call(id(1), 'get_admin_portal_session_v3').code, '42501');
  sql(
    `update admin_development_private.credentials set expires_at='infinity' where id='${id(10)}'`,
  );
  assert.equal(
    sql(
      `select expires_at > timestamptz '9999-12-31' from admin_development_private.credentials where id='${id(10)}'`,
    ),
    't',
  );
  assert.equal(call(null, 'personas').personas[0].id, id(5));
  assert.equal(call(id(5), 'get_admin_portal_session_v3').result.user_id, id(5));
  sql(`update admin_development_private.credentials set enabled=false where id='${id(10)}'`);
  assert.throws(() => call(null, 'personas'));
  assert.throws(() => call(id(5), 'get_admin_portal_session_v3'));
  sql(`update admin_development_private.credentials set enabled=true where id='${id(10)}'`);
  assert.equal(call(id(5), 'get_admin_portal_session_v3').result.user_id, id(5));
  console.log(
    'PASS: non-expiring developer credential supports directory/session access and immediate revocation',
  );
  verifyDevelopmentWorkflowUpgrade(sql, call, id(5));
  assert.equal(
    sql(
      `select principal_id from portal_identity_private.resolve_identity('employee','${sharedIssuer}','${sharedAudience}','user_shared_fixture','synthetic-session',true)`,
    ),
    id(5),
  );
  for (const [issuer, audience, mfa] of [
    [sharedIssuer, 'client_01M3VE4WTBYS2XN6NZPH9EDMQD', true],
    [sharedIssuer, sharedAudience, false],
    ['https://wrong.invalid', sharedAudience, true],
  ])
    assert.throws(() =>
      sql(
        `select * from portal_identity_private.resolve_identity('employee','${issuer}','${audience}','user_shared_fixture','synthetic-session',${mfa})`,
      ),
    );
  assert.equal(grantsSnapshot(), baselineGrants);
  const sharedAuditCount = sql('select count(*) from admin_development_private.audit');
  sql(source('supabase/overlays/employee_shared_staging_v1.rollback.sql'));
  assert.equal(
    sql(
      `select pg_get_functiondef('admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid)'::regprocedure)`,
    ),
    directoryAdapter,
  );
  assert.equal(sql('select count(*) from admin_development_private.audit'), sharedAuditCount);
  assert.equal(
    sql("select bool_and(revoked) from portal_identity_private.identities where realm='employee'"),
    't',
  );
  assert.equal(sql("select tgenabled from pg_trigger where tgname='portal_realm_immutable'"), 'O');
  assert.throws(() => call(id(5), 'get_admin_portal_session_v3'));
  console.log(
    'PASS: shared staging identity cutover, exact audience/MFA, old identity denial, immutable guard and retaining rollback',
  );
  sql(source('supabase/overlays/admin_development_employees_v2.rollback.sql'));
  assert.equal(
    sql(
      `select pg_get_functiondef('admin_development_private.invoke_v1(text,uuid,text,jsonb,uuid)'::regprocedure)`,
    ),
    adapterBefore,
  );
  assert.throws(() => call(id(1), 'get_admin_portal_session_v3'));
  console.log(
    'PASS: employee-driven directory, live rename/access/revocation, no implicit developer grant, dual audit and retaining rollback',
  );
  const count = sql('select count(*) from admin_development_private.audit');
  const permission = after.find((d) => d.name === 'admin_user_has_permission')!;
  sql(permission.definition.replace('declare', 'declare\n'));
  assert.throws(() => sql(source('supabase/overlays/admin_development_v1.rollback.sql')));
  assert.equal(
    sql('select enabled from admin_development_private.settings'),
    'f',
    'Drifted rollback still disables development access',
  );
  sql(permission.definition);
  sql(source('supabase/overlays/admin_development_v1.rollback.sql'));
  assert.deepEqual(snapshot(), baseline);
  assert.equal(grantsSnapshot(), baselineGrants);
  assert.equal(sql('select count(*) from admin_development_private.audit'), count);
  assert.equal(sql('select count(*) from public.app_announcements'), '1');
  assert.throws(() => call(id(1), 'get_admin_portal_session_v3'));
  console.log('PASS: rollback restores exact function definitions and preserves audit/data');
} catch (error) {
  console.error(errorOutput(error, 'stderr') || error);
  process.exitCode = 1;
} finally {
  room.stop();
}
