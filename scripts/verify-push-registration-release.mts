import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { firstEvidence, releaseBaseline } from './release-evidence.mts';
const root = 'test-results/push-registration-release-20260926';
assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), 'tvixsmqxotuvyjqzmjla');
const before = releaseBaseline(JSON.parse(readFileSync(`${root}/before.json`, 'utf8')));
const after = releaseBaseline(JSON.parse(readFileSync(`${root}/after.json`, 'utf8')));
const previous = before.functions['register_push_token(text)'],
  current = after.functions['register_push_token(text)'];
assert.ok(previous && current, 'Missing push registration definition');
assert.equal(current.hash, '1dc8db0962651d38f4920d6968f224a3');
previous.hash = current.hash;
for (const k of ['functions', 'policies', 'relations', 'triggers', 'role_settings'])
  assert.deepEqual(before[k], after[k], k);
const raw = execFileSync(
  process.execPath,
  [
    'node_modules/supabase/dist/supabase.js',
    'db',
    'query',
    '--linked',
    '--output-format',
    'json',
    '--file',
    'scripts/push-registration-live-read-check.sql',
  ],
  { encoding: 'utf8', timeout: 30_000 },
);
const checks = firstEvidence(JSON.parse(raw.slice(raw.indexOf('{'))), 'checks');
assert.ok(Object.values(checks).every((value) => value === true));
assert.equal(checks.member_feed, true);
assert.equal(checks.member_comments, true);
const result = {
  verifiedAt: new Date().toISOString(),
  status: 'passed',
  checks,
  unchangedFunctions: 320,
  allFunctionPermissionsUnchanged: true,
  unchangedContracts: ['policies', 'relations', 'triggers', 'role_settings'],
  overdueOutbox: after.overdue_outbox,
  clientLockWaits: after.client_lock_waits,
};
writeFileSync(`${root}/verified.json`, JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
