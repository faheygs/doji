// Synthetic, network-disabled test data only; never a hosted provisioning script.
import { installManagedSchemas, replay } from './clean-room.mts';
import { source } from './integration.mts';
import type { TestRoom } from './contracts.mts';
import type { DevelopmentDefinition } from '../build-admin-development-sql.mts';
import { buildAdminDevelopmentWorkflowSql } from '../build-admin-development-sql.mts';
import { employeeWorkflowContracts } from '../../infra/portal-identity/employee-workflow-contracts.mts';
import assert from 'node:assert/strict';

export const developmentFixtureId = (n: number) =>
  `98000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const developmentFixtureToken = 'a'.repeat(43);
export const developmentRealmSql = `insert into portal_identity_private.realms values('employee',true,
 'https://api.workos.com/user_management/client_01M3T5GJM7JZVQQ7CGHNJD0QMZ','client_01M3T5GJM7JZVQQ7CGHNJD0QMZ');`;
export function developmentDefinitions(sql: (query: string) => string): DevelopmentDefinition[] {
  return JSON.parse(
    sql(`select jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,
    'signature',n.nspname||'.'||p.proname||'('||oidvectortypes(p.proargtypes)||')',
    'definition',pg_get_functiondef(p.oid)) order by p.oid)
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.prokind='f'
    and n.nspname in ('public','auth','storage','portal_identity_private',
    'business_private','safety_private','moderation_private','staff_workflow_private');`),
  );
}
export async function installDevelopmentBase(room: TestRoom) {
  installManagedSchemas(room);
  await replay(room);
  for (const name of [
    'business_applications_v1',
    'portal_identity_registry_v1',
    'employee_session_store_v1',
    'portal_employee_actors_v1',
    'moderation_media_ledger_v1',
    'moderation_media_restoration_v1',
    'moderation_media_cleanup_v1',
    'moderation_media_evidence_v1',
    'portal_identity_employee_rpc_v1',
    'portal_employee_directory_v1',
    'staff_case_ownership_v1',
    'staff_workflow_employee_bridge_v1',
    'business_privacy_v1',
    'external_takedown_intake_v1',
    'external_takedown_alerts_v1',
    'external_takedown_alert_wakeup_v1',
    'external_takedown_staff_bridge_v1',
    'staff_workflow_extended_v1',
    'staff_workflow_events_v1',
    'staff_workflow_queue_indexes_v1',
    'staff_safety_queue_v1',
    'employee_history_reads_v1',
    'employee_announcement_compose_v1',
  ])
    room.sql(
      'set role postgres;set search_path=public,extensions;\n' +
        source(`supabase/overlays/${name}.sql`),
    );
}
export function provisionDevelopmentFixture(sql: (query: string) => string) {
  const id = developmentFixtureId;
  sql(`create role doji_staging_development_login nologin noinherit;
    grant doji_staging_development to doji_staging_development_login;
    update public.admin_employee_cutover set employee_only=true;
    ${[1, 2, 3]
      .map(
        (
          n,
        ) => `select portal_identity_private.bind_identity('employee','user_dev_${n}','${id(n)}','Synthetic staging test identity');
      select portal_identity_private.prepare_employee_actor_v1('${id(n)}','Synthetic test actor registry');
      select portal_identity_private.set_principal_state('${id(n)}',1,'active','Synthetic test activation');
      insert into public.admin_employees(id,display_name,status,roles) values('${id(n)}','Test persona ${n}','active',array['${n === 1 ? 'super_admin' : 'moderator'}']);
      insert into portal_identity_private.employee_contacts(id,email,verified_at) values('${id(n)}','persona${n}@test.invalid',now());
      insert into admin_development_private.personas values('${id(n)}','Test persona ${n}',true);`,
      )
      .join('\n')}
    insert into admin_development_private.credentials values('${id(10)}','developer-one',
      encode(extensions.digest('${developmentFixtureToken}','sha256'),'hex'),now()+interval '1 hour',true);
    insert into admin_development_private.grants values('${id(10)}','${id(1)}'),('${id(10)}','${id(2)}');`);
}

export function verifyDevelopmentWorkflowUpgrade(
  sql: (query: string) => string,
  call: (
    persona: string,
    name: string,
    args?: Record<string, unknown>,
  ) => {
    ok: boolean;
    code?: string;
    result?: { scope?: string; items?: unknown[] };
  },
  persona: string,
) {
  const names = Object.keys(employeeWorkflowContracts)
    .filter((name) => name !== 'get_admin_staff_event_channels_v1')
    .map((name) => `'${name}'`)
    .join(',');
  const inventory = () =>
    sql('select jsonb_agg(to_jsonb(r) order by name) from admin_development_private.routes r');
  const installed = inventory();
  sql(`delete from admin_development_private.routes where name in (${names})`);
  const before = inventory();
  assert.equal(call(persona, 'get_admin_staff_work_page_v1').code, '42501');
  const patch = buildAdminDevelopmentWorkflowSql(developmentDefinitions(sql));
  sql(patch.apply);
  assert.equal(inventory(), installed);
  assert.throws(() => sql(patch.apply), /./, 'Reapplying must not overwrite routes');
  sql(
    'update staff_workflow_private.settings set enabled=true,extended_enabled=true,safety_queue_enabled=true',
  );
  const inbox = call(persona, 'get_admin_staff_work_page_v1');
  assert.equal(inbox.ok, true, JSON.stringify(inbox));
  assert.equal(inbox.result?.scope, 'staff_inbox_v1');
  assert.ok(Array.isArray(inbox.result?.items));
  assert.equal(call(persona, 'get_admin_staff_work_page_v1', { p_limit: 99 }).code, '22023');
  assert.equal(call(persona, 'get_admin_staff_event_channels_v1').code, '42501');
  const audit = sql('select count(*) from admin_development_private.audit');
  sql(
    "update admin_development_private.routes set defaults='{}' where name='get_admin_staff_work_page_v1'",
  );
  assert.throws(() => sql(patch.rollback), /./, 'Rollback must reject route drift');
  assert.equal(
    sql(`select count(*) from admin_development_private.routes where name in (${names})`),
    '6',
  );
  sql(
    `update admin_development_private.routes set defaults='${JSON.stringify(employeeWorkflowContracts.get_admin_staff_work_page_v1!.defaults)}' where name='get_admin_staff_work_page_v1'`,
  );
  sql(patch.rollback);
  assert.equal(inventory(), before);
  assert.equal(sql('select count(*) from admin_development_private.audit'), audit);
  assert.equal(call(persona, 'get_admin_staff_work_page_v1').code, '42501');
  sql(patch.apply);
  assert.equal(inventory(), installed);
  console.log(
    'PASS: missing workflow route reproduced; bounded inbox, realtime denial, exact upgrade/retaining rollback and drift guards',
  );
}
