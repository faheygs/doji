// Bounded, read-only release canaries. Never prints credentials or member rows.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { cli } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
const q = `begin read only; set local statement_timeout='5s'; set local lock_timeout='1s';
select set_config('request.jwt.claims','{"sub":"57f7d45d-d10a-4426-923b-dcdc6f2b1bbc","role":"authenticated","aal":"aal1"}',true);
set local role authenticated;
select jsonb_build_object('profile',public.get_own_profile() is not null,
'realtime',public.get_realtime_token_capabilities()->>'userId'='57f7d45d-d10a-4426-923b-dcdc6f2b1bbc',
'employee_directory_denied',not has_function_privilege('authenticated','public.get_admin_employee_directory_v1()','execute')) member_checks;
rollback;`;
const rows = evidenceRows(cli(['db', 'query', q, '--linked', '--output-format', 'json']));
const health = evidenceRows(
  cli([
    'db',
    'query',
    "begin read only;set local statement_timeout='5s';select jsonb_build_object('at',clock_timestamp(),'health',public.get_operational_health()) snapshot;rollback;",
    '--linked',
    '--output-format',
    'json',
  ]),
).find((r) => r.snapshot)?.snapshot;
const member = evidenceRecord(rows.find((r) => r.member_checks)?.member_checks);
assert.ok(health && member);
assert.ok(Object.values(member).every((v) => v === true));
const boundaries = [];
for (const [origin, expected] of [
  ['https://admin.dojipro.com', 401],
  ['https://business.dojipro.com', 403],
] as const) {
  const r = await fetch('https://admin.dojipro.com/api/session', {
    headers: { origin },
    signal: AbortSignal.timeout(20000),
  });
  boundaries.push({ origin, status: r.status, cacheControl: r.headers.get('cache-control') });
  assert.equal(r.status, expected);
  assert.equal(r.headers.get('cache-control'), 'no-store');
}
const result = { at: new Date().toISOString(), health, member, boundaries };
await writeFile(
  'test-results/performance-repair-20261002/live-canaries.json',
  JSON.stringify(result, null, 2),
);
console.log(JSON.stringify(result));
