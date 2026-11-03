import assert from 'node:assert/strict';
import { source } from './integration.mts';

/** Called only inside the existing owned, network-disabled development clean room. */
export function verifyDevelopmentHealthSnapshot(
  sql: (text: string) => string,
  call: (
    persona: string | null,
    name: string,
    args?: Record<string, unknown>,
  ) => { result?: { enabled?: boolean; available?: boolean }; code?: string },
  id: (n: number) => string,
) {
  sql(source('supabase/overlays/employee_health_snapshot_v1.sql'));
  sql(source('supabase/overlays/admin_development_health_snapshot_v1.sql'));
  const read = () => call(id(5), 'get_admin_health_snapshot_v1', { p_summary: true });
  assert.equal(read().code, '42501', 'Unbound staging cache denied');
  sql("update employee_health_snapshot_private.settings set project_ref='ohrcupagdoilkwhecict';");
  assert.equal(read().result?.enabled, false);
  sql('update employee_health_snapshot_private.settings set enabled=true;');
  assert.equal(read().result?.available, false);
  sql(
    "select public.capture_employee_health_snapshot_v1('ohrcupagdoilkwhecict',jsonb_build_object('healthy',true,'checked_at',clock_timestamp()));",
  );
  assert.equal(read().result?.available, true);
  assert.equal(
    call(id(5), 'get_admin_health_snapshot_v1', { p_summary: true, actor: id(1) }).code,
    '22023',
  );
  sql(`update public.admin_employees set roles=array['moderator'] where id='${id(5)}';`);
  assert.equal(read().code, '42501');
  sql(`update public.admin_employees set roles=array['super_admin'] where id='${id(5)}';`);
  sql(`update admin_development_private.credentials set enabled=false where id='${id(10)}';`);
  assert.throws(read);
  sql(`update admin_development_private.credentials set enabled=true where id='${id(10)}';`);
  sql("update employee_health_snapshot_private.settings set project_ref='tvixsmqxotuvyjqzmjla';");
  assert.equal(read().code, '42501', 'Production-bound cache cannot serve local development');
  for (const role of [
    'anon',
    'authenticated',
    'service_role',
    'doji_employee',
    'doji_employee_application',
    'doji_staging_development',
  ]) {
    assert.equal(
      sql(
        `select has_function_privilege('${role}','admin_development_private.health_snapshot_v1(boolean)','EXECUTE');`,
      ),
      'f',
    );
  }
  assert.throws(() => sql('select admin_development_private.health_snapshot_v1(true);'));
  sql(source('supabase/overlays/admin_development_health_snapshot_v1.rollback.sql'));
  assert.equal(read().code, '42501');
  sql(source('supabase/overlays/employee_health_snapshot_v1.rollback.sql'));
  assert.equal(sql('select count(*) from employee_health_snapshot_private.snapshot;'), '1');
  // Only this disposable clean room is restored; the real rollback retains evidence.
  sql(`drop function portal_identity_private.employee_health_snapshot_rpc_v1(text,text,text,text,boolean,text,jsonb),
    public.get_admin_health_snapshot_v1(boolean),public.capture_employee_health_snapshot_v1(text,jsonb);
    drop schema employee_health_snapshot_private cascade;`);
  console.log(
    'PASS: cached local health preserves real persona permissions, revocation, environment isolation and retaining rollback',
  );
}
