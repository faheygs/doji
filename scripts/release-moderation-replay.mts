// Owner-approved, two-function release only. No broad push or uncertain-write retries.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  evidenceRecord,
  evidenceArray,
  evidenceText,
  evidenceStrings,
  evidenceRows,
} from './release-evidence.mts';
import { patchModeration, signatures } from './moderation-replay-patch.mts';
const root = 'test-results/moderation-replay-release';
const version = '20261009034000';
const migrationPath = `supabase/migrations/${version}_moderation_outer_replay.sql`;
const read = (path: string) => readFileSync(path, 'utf8');
const json = (name: string) => evidenceRecord(JSON.parse(read(`${root}/${name}.json`)));
const save = (name: string, value: unknown) =>
  writeFileSync(
    `${root}/${name}`,
    typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    { flag: 'wx' },
  );
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const q = (value: string) => "'" + value.replaceAll("'", "''") + "'";
const before = json('before');
const targets = evidenceArray(before.targets);
const functions = evidenceRecord(before.functions);
const names = signatures.map((s) => s.slice(7));
const array = `array[${names.map(q).join(',')}]`;
const candidate = evidenceStrings(JSON.parse(read(`${root}/candidate.json`)));
const local = json('local-result');
const installed = evidenceStrings(local.installedHashes);
const regression = json('member-regressions');
assert.deepEqual(evidenceRecord(regression.tests).failures, []);
assert.equal(candidate.length, 2);
assert.equal(installed.length, 2);
for (const [i, s] of signatures.entries()) {
  const target = targets.find(
    (t) => 'public.' + evidenceText(t.signature).replaceAll(', ', ',') === s,
  );
  assert.ok(target);
  assert.equal(candidate[i], patchModeration(evidenceText(target.definition), i === 1));
  assert.equal(
    createHash('md5').update(candidate[i]!).digest('hex'),
    evidenceStrings(local.candidateHashes)[i],
  );
}
assert.equal(
  read('D:/ChallengeApp/DoIt/supabase/.temp/project-ref').trim(),
  'tvixsmqxotuvyjqzmjla',
);
function query(file: string) {
  const raw = execFileSync(
    process.execPath,
    [
      'node_modules/supabase/dist/supabase.js',
      'db',
      'query',
      '--linked',
      '--workdir',
      'D:/ChallengeApp/DoIt',
      '--output-format',
      'json',
      '--file',
      process.cwd() + '/' + file,
    ],
    { encoding: 'utf8', timeout: 30000, maxBuffer: 3e6 },
  );
  return evidenceRows(JSON.parse(raw.slice(raw.indexOf('{'))));
}
const capture = read('scripts/moderation-replay-capture.sql');
const snapshot = capture
  .slice(capture.indexOf('select jsonb_build_object('), capture.lastIndexOf('rollback;'))
  .trim()
  .replace(/;$/, '');
const table = (name: string) => `create temp table ${name} on commit drop as ${snapshot};\n`;
const fingerprintGuard = (hashes: string[]) =>
  `do $guard$ begin\n${signatures.map((s, i) => `if md5(pg_get_functiondef(${q(s)}::regprocedure))<>${q(hashes[i]!)} then raise exception 'Moderation function drift';end if;`).join('\n')}\nend $guard$;\n`;
const original = signatures.map(
  (s) => targets.find((t) => 'public.' + evidenceText(t.signature).replaceAll(', ', ',') === s)!,
);
const rollbackBody =
  fingerprintGuard(installed) + original.map((t) => evidenceText(t.definition) + ';').join('\n');
const mode = process.argv[2];
assert.ok(['prepare', 'rehearsal', 'deploy', 'verify'].includes(mode ?? ''));
if (mode === 'prepare') {
  const migration =
    "-- Repair whole-command replay only; preserve existing policy, permissions and member contracts.\nbegin;\nset local lock_timeout='2s';\nset local statement_timeout='8s';\n" +
    fingerprintGuard(original.map((t) => evidenceText(t.hash))) +
    candidate.join(';\n') +
    ';\ncommit;\n';
  assert.ok(!existsSync(migrationPath), 'Do not overwrite a migration');
  execFileSync(
    'C:/Users/gfahe/AppData/Local/OpenAI/Codex/bin/979a96ce184041d1/codex.exe',
    [
      '--codex-run-as-apply-patch',
      `*** Begin Patch\n*** Add File: ${process.cwd().replaceAll('\\', '/')}/${migrationPath}\n${migration
        .split('\n')
        .map((l) => '+' + l)
        .join('\n')}\n*** End Patch`,
    ],
    { encoding: 'utf8' },
  );
  const body = migration
    .slice(migration.indexOf(fingerprintGuard(original.map((t) => evidenceText(t.hash)))))
    .replace(/commit;\s*$/, '');
  const guard = `do $g$ declare b jsonb;begin select baseline into b from replay_before;
    if b->'functions' is distinct from ${q(JSON.stringify(functions))}::jsonb or b->'policies' is distinct from ${q(JSON.stringify(before.policies))}::jsonb
    or b->'receipt_view' is distinct from ${q(JSON.stringify(before.receipt_view))}::jsonb then raise exception 'Unreviewed database drift';end if;
    if (b->>'active')::int<>0 or (b->>'locks')::int<>0 or b->>'next' is null
      or (b->>'next')::timestamptz<clock_timestamp()+interval '25 minutes' then raise exception 'Unsafe release window';end if;
    if exists(select 1 from supabase_migrations.schema_migrations where version='${version}') then raise exception 'Migration already recorded';end if;
  end $g$;\n`;
  const verify = `do $v$ declare b jsonb;a jsonb;n text;begin select baseline into b from replay_before;select baseline into a from replay_after;
    if (a->'functions')-${array} is distinct from (b->'functions')-${array} then raise exception 'Unrelated function changed';end if;
    foreach n in array ${array} loop if ((a->'functions'->n)-'hash') is distinct from ((b->'functions'->n)-'hash') then raise exception 'Owner or grants changed';end if;end loop;
    if a->'policies' is distinct from b->'policies' or a->'receipt_view' is distinct from b->'receipt_view' then raise exception 'Policy or receipt routing changed';end if;
  end $v$;\n`;
  const common =
    "begin;set local lock_timeout='2s';set local statement_timeout='8s';\n" +
    table('replay_before') +
    guard +
    body +
    fingerprintGuard(installed) +
    table('replay_after') +
    verify;
  save('common.sql', common);
  save(
    'rollback.sql',
    "begin;set local lock_timeout='2s';set local statement_timeout='8s';\n" +
      rollbackBody +
      "\nnotify pgrst,'reload schema';commit;\n",
  );
  save(
    'rehearsal.sql',
    common +
      rollbackBody +
      '\n' +
      table('replay_restored') +
      `do $$begin if (select baseline->'functions' from replay_restored) is distinct from (select baseline->'functions' from replay_before) then raise exception 'Rollback failed';end if;end$$;select true as rehearsal_passed;rollback;\n`,
  );
  save(
    'deploy.sql',
    common +
      `insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','moderation_outer_replay',array[${q(body)}]);notify pgrst,'reload schema';select clock_timestamp() as deployed_at;commit;\n`,
  );
  save('prepared.json', {
    migrationHash: hash(read(migrationPath)),
    commonHash: hash(common),
    candidateHashes: installed,
    local,
    regressionAt: regression.at,
  });
  console.log('Prepared exact two-function migration, guarded release and rollback; not deployed.');
} else if (mode === 'rehearsal' || mode === 'deploy') {
  const prepared = json('prepared'),
    common = read(`${root}/common.sql`),
    sql = read(`${root}/${mode}.sql`);
  assert.equal(hash(common), prepared.commonHash);
  assert.equal(hash(read(migrationPath)), prepared.migrationHash);
  assert.ok(sql.startsWith(common));
  if (mode === 'deploy') {
    assert.equal(process.argv[3], '--deploy-reviewed-artifact');
    const rehearsal = json('rehearsal-result');
    assert.equal(rehearsal.commonHash, prepared.commonHash);
    assert.equal(evidenceArray(rehearsal.rows)[0]?.rehearsal_passed, true);
    save('deploy-started.json', { at: new Date().toISOString(), sha256: hash(sql) });
  }
  const rows = query(`${root}/${mode}.sql`);
  save(`${mode}-result.json`, {
    at: new Date().toISOString(),
    sha256: hash(sql),
    commonHash: prepared.commonHash,
    rows,
  });
  console.log(JSON.stringify(rows));
} else {
  assert.ok(existsSync(`${root}/deploy-started.json`));
  const after = evidenceRecord(query('scripts/moderation-replay-capture.sql')[0]?.baseline);
  const afterFunctions = evidenceRecord(after.functions);
  const omit = (x: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(x).filter(([name]) => !names.includes(name as (typeof names)[number])),
    );
  assert.deepEqual(omit(afterFunctions), omit(functions));
  for (const [i, name] of names.entries()) {
    const b = evidenceRecord(functions[name]),
      a = evidenceRecord(afterFunctions[name]);
    assert.equal(a.hash, installed[i]);
    assert.deepEqual(a.acl, b.acl);
    assert.equal(a.owner, b.owner);
  }
  assert.equal(after.policies, before.policies);
  assert.equal(after.receipt_view, before.receipt_view);
  save('verified.json', {
    at: after.at,
    targets: installed,
    unchangedFunctions: Object.keys(functions).length - 2,
    policiesPreserved: true,
    receiptRoutingPreserved: true,
    locks: after.locks,
    active: after.active,
  });
  console.log(read(`${root}/verified.json`));
}
