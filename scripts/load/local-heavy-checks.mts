import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { loadState } from './contracts.mts';
import { offlineContainer } from '../database/contracts.mts';
const root = 'test-results/local-query-repair-20260928';
const { db, container } = loadState(readFileSync(`${root}/state.json`, 'utf8'));
assert.match(db, /^heavy_load_qa_[0-9]+$/);
assert.equal(container, 'supabase_db_employee-cutover-verify');
const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
offlineContainer(JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })));
const args = [
  'exec',
  '-i',
  container,
  'psql',
  '-X',
  '-h',
  '/var/run/postgresql',
  '-U',
  'postgres',
  '-d',
  db,
  '-At',
  '-v',
  'ON_ERROR_STOP=1',
];
const guard = execFileSync(podman, args, {
  input:
    "select count(*) from auth.users where email is null or email not like '%@test.invalid';select count(*) from vault.secrets;",
  encoding: 'utf8',
}).trim();
assert.equal(guard, '0\n0');
const result = spawnSync(podman, args, {
  input: readFileSync('scripts/load/local-heavy-push.sql', 'utf8'),
  encoding: 'utf8',
  timeout: 150000,
  maxBuffer: 5e6,
});
writeFileSync(`${root}/push-checks.txt`, result.stdout + '\n' + result.stderr);
assert.equal(result.status, 0, result.stderr);
console.log(result.stderr);
