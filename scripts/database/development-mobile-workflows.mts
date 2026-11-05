import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export function verifyDevelopmentMobileWorkflows(
  sql: (query: string) => string,
  call: (
    persona: string,
    name: string,
    args?: Record<string, unknown>,
  ) => { code?: string; result?: unknown },
  id: (n: number) => string,
) {
  const source = (name: string) => readFileSync(`supabase/overlays/${name}.sql`, 'utf8');
  sql(source('mobile_workflow_counts_v1'));
  sql(source('admin_development_mobile_workflows_v1'));
  const read = () => call(id(5), 'get_admin_mobile_workflows_v1');
  assert.equal((read().result as { enabled: boolean }).enabled, false);
  sql(`update mobile_workflow_private.settings set enabled=true;
    insert into mobile_workflow_private.hours values(0,date_trunc('hour',now()),'ios','submit','confirmed',2,false,now());`);
  assert.equal((read().result as { rows: unknown[] }).rows.length, 1);
  assert.equal(call(id(5), 'get_admin_mobile_workflows_v1', { actor: id(1) }).code, '22023');
  assert.throws(() => sql('select admin_development_private.mobile_workflows_v1();'));
  sql(`update public.admin_employees set roles=array['moderator'] where id='${id(5)}';`);
  assert.equal(read().code, '42501');
  sql(`update public.admin_employees set roles=array['super_admin'] where id='${id(5)}';
    update admin_development_private.credentials set enabled=false where id='${id(10)}';`);
  assert.throws(read);
  sql(`update admin_development_private.credentials set enabled=true where id='${id(10)}';`);
  sql(source('admin_development_mobile_workflows_v1.rollback'));
  assert.equal(read().code, '42501');
  assert.equal(sql('select count(*) from mobile_workflow_private.hours;'), '1');
  // Restore only this owned clean-room schema for the harness's exact inverse checks.
  sql(
    'drop function public.record_mobile_workflow_counts_v1(uuid,jsonb),public.get_mobile_workflow_counts_v1();drop schema mobile_workflow_private cascade;',
  );
  console.log('PASS: staging device read permissions, revocation and retaining rollback');
}
