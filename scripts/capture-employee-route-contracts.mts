// Bounded read-only catalog evidence for existing portal routes, not member data.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { cli, hash } from './prepare-safety-launch.mts';
import { evidenceRows } from './release-evidence.mts';
const files = ['website/admin-portal/live-client.mts', 'infra/doji-orchestrator/src/portal-read.ts'];
const names = new Set([
  'get_admin_operational_health_read_v1',
  'get_admin_employee_directory_v1',
  'admin_set_employee_role_v1',
]);
const sources = [];
for (const path of files) {
  const source = await readFile(path, 'utf8');
  sources.push({ path, hash: hash(source) });
  for (const m of source.matchAll(/'((?:get_admin|admin_)[a-z0-9_]+)'/g)) {
    assert.ok(m[1]);
    names.add(m[1]);
  }
}
names.delete('get_admin_operator_directory_v1');
names.delete('admin_set_operator_role_v1');
assert.ok(names.size < 60);
assert.ok([...names].every((n) => /^[a-z][a-z0-9_]+$/.test(n)));
const sql = `begin read only;set local statement_timeout='5s';select p.proname name,p.proargnames names,
 array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t) types,
 p.pronargdefaults defaults,pg_get_expr(p.proargdefaults,0) default_expressions,
 pg_get_function_result(p.oid) result,p.prosecdef security_definer,
 has_function_privilege('doji_employee',p.oid,'EXECUTE') employee_execute,
 pg_get_functiondef(p.oid) definition,md5(pg_get_functiondef(p.oid)) source_hash
 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname in(${[...names].map((n) => `'${n}'`).join(',')}) order by p.proname;rollback;`;
const rows = evidenceRows(cli(['db', 'query', sql, '--linked', '--output-format', 'json']));
assert.equal(rows.length, names.size);
assert.equal(new Set(rows.map((r) => r.name)).size, names.size);
for (const r of rows) {
  assert.equal(r.security_definer, true);
  assert.equal(r.employee_execute, true);
  assert.equal(r.result, 'jsonb');
  assert.ok(
    Array.isArray(r.types) && (r.names == null || Array.isArray(r.names)),
    'Invalid route argument contract',
  );
  assert.equal(r.types.length, r.names?.length || 0);
}
const root = 'test-results/employee-route-contracts-20261001';
await mkdir(root, { recursive: true });
await writeFile(
  `${root}/catalog.json`,
  JSON.stringify({ at: new Date().toISOString(), sources, rows }, null, 2),
  { flag: 'wx' },
);
console.log(
  JSON.stringify({
    routes: rows.length,
    names: rows.map((r) => r.name),
    path: `${root}/catalog.json`,
  }),
);
