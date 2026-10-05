// Owner-approved Android-only policy operation. No migrations or automatic retries.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {evidenceRecord,evidenceArray,evidenceText,evidenceNumber,evidenceRows} from './release-evidence.mts';

assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), 'tvixsmqxotuvyjqzmjla');
const root = 'test-results/android-diagnostics-26/enforcement';
mkdirSync(root, { recursive: true });
const snapshotSql = `select jsonb_agg(to_jsonb(p) order by platform) as policies
from public.mobile_release_policy p`;
const sqlLiteral = (value:unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
function query(sql:string) {
  const raw = execFileSync(process.execPath, [
    'node_modules/supabase/dist/supabase.js', 'db', 'query', '--linked',
    '--output-format', 'json', sql,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 1e6 });
  return evidenceRows(JSON.parse(raw.slice(raw.indexOf('{'))));
}
function save(name:string, value:unknown) {
  writeFileSync(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
}
function row(value:unknown, platform:string) {
  const rows=evidenceArray(value);
  assert.equal(rows.length, 2, 'Expected exactly two platform policies');
  const found = rows.filter((item) => item.platform === platform);
  assert.equal(found.length, 1);
  return evidenceRecord(found[0]);
}
function compareVersion(left:string, right:string) {
  assert.match(left, /^\d+(\.\d+){1,3}$/);
  const a = left.split('.').map(Number), b = right.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return Math.sign((a[i] ?? 0) - (b[i] ?? 0));
  }
  return 0;
}
function verify(before:unknown, after:unknown) {
  assert.deepEqual(row(after, 'ios'), row(before, 'ios'), 'iOS changed');
  const android = row(after, 'android');
  assert.deepEqual(android, {
    ...row(before, 'android'), latest_version: '1.0.8', latest_build: 26,
    minimum_version: '1.0.8', minimum_build: 26, enabled: true, updated_at: android.updated_at,
  }, 'Unexpected Android fields');
  return android;
}
const mode = process.argv[2];
if (mode === 'snapshot') {
  const policies = evidenceArray(query(snapshotSql)[0]?.policies);
  row(policies, 'android'); row(policies, 'ios');
  save('before', { at: new Date().toISOString(), policies });
  console.log(JSON.stringify({ snapshotSaved: true, policies }));
} else if (mode === 'apply') {
  const before = evidenceArray(evidenceRecord(JSON.parse(readFileSync(`${root}/before.json`, 'utf8'))).policies);
  const android = row(before, 'android');
  assert.equal(android.store_url, 'https://play.google.com/store/apps/details?id=com.doit.challengeapp');
  for (const prefix of ['latest', 'minimum']) {
    assert(Number.isSafeInteger(android[`${prefix}_build`]));
    const cmp = compareVersion(evidenceText(android[`${prefix}_version`]), '1.0.8');
    assert(cmp < 0 || (cmp === 0 && evidenceNumber(android[`${prefix}_build`]) <= 26), 'Refusing policy downgrade');
  }
  const sql = `begin;
set local lock_timeout = '2s';
set local statement_timeout = '5s';
do $policy$
declare current_rows jsonb;
begin
  perform 1 from public.mobile_release_policy order by platform for update;
  select jsonb_agg(to_jsonb(p) order by platform) into current_rows from public.mobile_release_policy p;
  if current_rows is distinct from ${sqlLiteral(before)} then
    raise exception 'Policy changed since snapshot; stop and recheck';
  end if;
  update public.mobile_release_policy set latest_version = '1.0.8', latest_build = 26,
    minimum_version = '1.0.8', minimum_build = 26, enabled = true, updated_at = clock_timestamp()
  where platform = 'android';
  if not found then raise exception 'Missing Android policy'; end if;
end $policy$;
${snapshotSql};
commit;`;
  writeFileSync(`${root}/apply.sql`, sql, { flag: 'wx' });
  save('attempt', { at: new Date().toISOString(), target: 'android/1.0.8/26' });
  const after = evidenceArray(query(sql)[0]?.policies);
  save('after', { at: new Date().toISOString(), policies: after });
  verify(before, after);
  const rollback = `begin;
set local lock_timeout = '2s';
set local statement_timeout = '5s';
do $rollback$
declare current_android jsonb;
begin
  select to_jsonb(p) into current_android from public.mobile_release_policy p where platform = 'android' for update;
  if current_android is distinct from ${sqlLiteral(row(after, 'android'))} then
    raise exception 'Android policy changed after enforcement; rollback refused';
  end if;
  update public.mobile_release_policy p set
    latest_version = b.latest_version, latest_build = b.latest_build,
    minimum_version = b.minimum_version, minimum_build = b.minimum_build,
    enabled = b.enabled, updated_at = b.updated_at
  from jsonb_populate_record(null::public.mobile_release_policy, ${sqlLiteral(android)}) b
  where p.platform = 'android';
end $rollback$;
commit;`;
  writeFileSync(`${root}/rollback.sql`, rollback, { flag: 'wx' });
  console.log(JSON.stringify({ enforced: true, iosUnchanged: true, policies: after }));
} else if (mode === 'verify') {
  const before = evidenceArray(evidenceRecord(JSON.parse(readFileSync(`${root}/before.json`, 'utf8'))).policies);
  const after = evidenceArray(query(snapshotSql)[0]?.policies);
  const android = verify(before, after);
  const results:Record<string,string> = {};
  for (const role of ['anon', 'authenticated']) {
    const reads = evidenceArray(query(`begin; set local role ${role};
      select jsonb_agg(to_jsonb(p)) as policies from public.get_mobile_release_policy('android') p;
      rollback;`)[0]?.policies);
    const { enabled, ...expected } = android;
    assert.equal(enabled, true);
    assert.deepEqual(reads, [expected]);
    results[role] = 'passed';
  }
  save('verified', { at: new Date().toISOString(), policies: after, rpc: results });
  console.log(JSON.stringify({ verified: true, iosUnchanged: true, rpc: results, policies: after }));
} else {
  throw new Error('Use snapshot, apply (once only), or verify. Rollback is explicit and never automatic.');
}
