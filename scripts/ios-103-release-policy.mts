// Owner explicitly authorized iOS 103 enforcement using their release confirmation.
// Configuration only: no migrations, store actions, or automatic write retries.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import {evidenceRecord,evidenceArray,evidenceText,evidenceNumber,evidenceRows} from './release-evidence.mts';

assert.equal(readFileSync('supabase/.temp/project-ref', 'utf8').trim(), 'tvixsmqxotuvyjqzmjla');
const root = 'test-results/ios-security-103/enforcement';
mkdirSync(root, { recursive: true });
const snapshotSql = 'select jsonb_agg(to_jsonb(p) order by platform) as policies from public.mobile_release_policy p';
const literal = (value:unknown) => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
function query(sql:string) {
  const raw = execFileSync(process.execPath, [
    'node_modules/supabase/dist/supabase.js', 'db', 'query', '--linked', '--output-format', 'json', sql,
  ], { encoding: 'utf8', timeout: 30000, maxBuffer: 1e6 });
  return evidenceRows(JSON.parse(raw.slice(raw.indexOf('{'))));
}
function save(name:string, data:unknown) {
  writeFileSync(`${root}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
}
function row(value:unknown, platform:string) {
  const rows=evidenceArray(value);
  assert.equal(rows.length, 2);
  const matches = rows.filter(p => p.platform === platform);
  assert.equal(matches.length, 1);
  return evidenceRecord(matches[0]);
}
function compareVersion(a:string, b:string) {
  assert.match(a, /^\d+(\.\d+){1,3}$/);
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = (left[i] ?? 0) - (right[i] ?? 0);
    if (diff) return Math.sign(diff);
  }
  return 0;
}
function verify(before:unknown, after:unknown) {
  assert.deepEqual(row(after, 'android'), row(before, 'android'), 'Android changed');
  const ios = row(after, 'ios');
  assert.deepEqual(ios, {
    ...row(before, 'ios'), latest_version: '1.0.8', latest_build: 103,
    minimum_version: '1.0.8', minimum_build: 103, enabled: true, updated_at: ios.updated_at,
  }, 'Unexpected iOS policy');
  return ios;
}
const mode = process.argv[2];
if (mode === 'snapshot') {
  const policies = evidenceArray(query(snapshotSql)[0]?.policies);
  row(policies, 'android'); row(policies, 'ios');
  save('before', { at: new Date().toISOString(), availabilityEvidence: 'Owner confirmation; independent Apple session unavailable', policies });
  console.log(JSON.stringify({ snapshotSaved: true, policies }));
} else if (mode === 'apply') {
  const before = evidenceArray(evidenceRecord(JSON.parse(readFileSync(`${root}/before.json`, 'utf8'))).policies);
  const ios = row(before, 'ios');
  assert.equal(ios.store_url, 'https://apps.apple.com/app/id6768727326');
  for (const prefix of ['latest', 'minimum']) {
    assert(Number.isSafeInteger(ios[`${prefix}_build`]));
    const cmp = compareVersion(evidenceText(ios[`${prefix}_version`]), '1.0.8');
    assert(cmp < 0 || (cmp === 0 && evidenceNumber(ios[`${prefix}_build`]) <= 103), 'Refusing downgrade');
  }
  const sql = `begin;
set local lock_timeout = '2s';
set local statement_timeout = '5s';
do $policy$
declare current_rows jsonb;
begin
  perform 1 from public.mobile_release_policy order by platform for update;
  select jsonb_agg(to_jsonb(p) order by platform) into current_rows from public.mobile_release_policy p;
  if current_rows is distinct from ${literal(before)} then
    raise exception 'Policy changed since snapshot; stop and recheck';
  end if;
  update public.mobile_release_policy set latest_version = '1.0.8', latest_build = 103,
    minimum_version = '1.0.8', minimum_build = 103, enabled = true, updated_at = clock_timestamp()
  where platform = 'ios';
  if not found then raise exception 'Missing iOS policy'; end if;
end $policy$;
${snapshotSql};
commit;`;
  writeFileSync(`${root}/apply.sql`, sql, { flag: 'wx' });
  save('attempt', { at: new Date().toISOString(), target: 'ios/1.0.8/103' });
  const after = evidenceArray(query(sql)[0]?.policies);
  save('after', { at: new Date().toISOString(), policies: after });
  verify(before, after);
  const rollback = `begin;
set local lock_timeout = '2s';
set local statement_timeout = '5s';
do $rollback$
declare current_ios jsonb;
begin
  select to_jsonb(p) into current_ios from public.mobile_release_policy p where platform = 'ios' for update;
  if current_ios is distinct from ${literal(row(after, 'ios'))} then
    raise exception 'iOS policy changed after enforcement; rollback refused';
  end if;
  update public.mobile_release_policy p set latest_version = b.latest_version, latest_build = b.latest_build,
    minimum_version = b.minimum_version, minimum_build = b.minimum_build, enabled = b.enabled, updated_at = b.updated_at
  from jsonb_populate_record(null::public.mobile_release_policy, ${literal(ios)}) b where p.platform = 'ios';
end $rollback$;
commit;`;
  writeFileSync(`${root}/rollback.sql`, rollback, { flag: 'wx' });
  console.log(JSON.stringify({ enforced: true, androidUnchanged: true, policies: after }));
} else if (mode === 'verify') {
  const before = evidenceArray(evidenceRecord(JSON.parse(readFileSync(`${root}/before.json`, 'utf8'))).policies);
  const after = evidenceArray(query(snapshotSql)[0]?.policies);
  const ios = verify(before, after);
  const results:Record<string,string> = {};
  for (const role of ['anon', 'authenticated']) {
    const reads = evidenceArray(query(`begin; set local role ${role};
      select jsonb_agg(to_jsonb(p)) as policies from public.get_mobile_release_policy('ios') p;
      rollback;`)[0]?.policies);
    const { enabled, ...expected } = ios;
    assert.equal(enabled, true);
    assert.deepEqual(reads, [expected]);
    results[role] = 'passed';
  }
  save('verified', { at: new Date().toISOString(), policies: after, rpc: results });
  console.log(JSON.stringify({ verified: true, androidUnchanged: true, rpc: results, policies: after }));
} else {
  throw new Error('Use snapshot, apply (once), or verify; rollback requires explicit action.');
}
