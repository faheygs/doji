// Owner-approved, single-function release. Never executes a review or member command.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cli, hash, ref } from './prepare-safety-launch.mts';
import { windowGuard } from './business-bridge-release-guards.mts';

const root = 'test-results/poll-reserved-other-v2';
const workspace = 'D:/ChallengeApp/DoIt';
const signature = 'public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)';
const target = `'${signature}'::regprocedure`;
const source = 'supabase/migrations/20261005020000_poll_reserved_other.sql';
const expected = '753a811245933f744056d4ad68ec521b5f1fb5cc3c037a929f2ab5ddcc722d81';
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'rehearse', 'apply', 'verify'].includes(mode));
assert.equal((await readFile(`${workspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
const query = <T,>(sql: string): T => {
  const result = cli<{ rows: T[] }>([
    'db', 'query', sql, '--linked', '--workdir', workspace, '--output-format', 'json',
  ]).rows[0];
  assert.ok(result, 'Missing bounded database result');
  return result;
};
const save = (name: string, value: unknown) => writeFile(
  `${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' },
);
// Catalog-only fingerprint: no member content, credentials or broad row reads.
const protectedSql = `select md5(jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,
   case when p.oid=${target} then null else pg_get_functiondef(p.oid) end,
   p.proacl::text,p.proowner,p.prosecdef,p.proconfig) order by p.oid)
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where p.prokind='f' and n.nspname not in('pg_catalog','information_schema') and n.nspname not like 'pg_temp%'),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in('r','p','v','m')
   and n.nspname not in('pg_catalog','information_schema') and n.nspname not like 'pg_temp%'),
 'triggers',(select jsonb_agg(jsonb_build_array(t.oid,pg_get_triggerdef(t.oid),t.tgenabled) order by t.oid)
   from pg_trigger t where not t.tgisinternal))::text)`;
interface State { definition: string; protected: string; queue: string }
const state = () => query<State>(`begin read only;set local statement_timeout='8s';
 select pg_get_functiondef(${target}) definition,(${protectedSql}) protected,
 (select md5(coalesce(jsonb_agg(to_jsonb(s) order by s.id)::text,'[]')) from
  (select * from public.challenge_suggestions where id::text like 'acaec350-%' or id::text like '6d5fd0b4-%' limit 2) s) queue;
 rollback;`);
interface Candidate { before: State; sourceHash: string; installHash: string; rehearsalHash: string; rollbackHash: string }
const patch = (await readFile(source, 'utf8')).replaceAll('\r\n', '\n');
const runFile = (name: string) => cli([
  'db', 'query', '--file', resolve(`${root}/${name}.sql`), '--linked', '--workdir', workspace, '--output-format', 'json',
]);
if (mode === 'prepare') {
  await mkdir(root, { recursive: true });
  const before = state();
  assert.equal(hash(before.definition), expected, 'Live approval definition drifted');
  const start = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
  do $$begin
   if not pg_try_advisory_xact_lock(hashtextextended('doji:poll-reserved-other-release',0)) then raise exception 'Release busy';end if;
   ${windowGuard}
   if md5(pg_get_functiondef(${target}))<>md5($original$${before.definition}$original$)
    or (${protectedSql})<>'${before.protected}' then raise exception 'Release contract drift';end if;
  end$$;`;
  const body = patch.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '');
  const guard = `do $$begin if (${protectedSql})<>'${before.protected}' then raise exception 'Unrelated contract changed';end if;end$$;`;
  const restore = `${before.definition};\n${guard}\n`;
  const install = `${start}\n${body}\n${guard}\ncommit;`;
  const rehearsal = `${start}\n${body}\n${guard}\nselect pg_get_functiondef(${target}) installed_definition;\n${restore}
    do $$begin if md5(pg_get_functiondef(${target}))<>md5($original$${before.definition}$original$)
     then raise exception 'Rollback definition mismatch';end if;end$$;rollback;`;
  // Rollback can restore code, not undo later real review decisions.
  const rollback = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
    do $$begin ${windowGuard}
    if pg_get_functiondef(${target}) not like '%approval_options jsonb%'
     or (${protectedSql})<>'${before.protected}' then raise exception 'Rollback drift: inspect before proceeding';end if;end$$;
    ${restore}commit;`;
  for (const [name, sql] of Object.entries({ install, rehearse: rehearsal, rollback })) {
    await writeFile(`${root}/${name}.sql`, sql, { flag: 'wx' });
  }
  await save('candidate', { before, sourceHash: hash(patch), installHash: hash(install),
    rehearsalHash: hash(rehearsal), rollbackHash: hash(rollback) } satisfies Candidate);
  console.log('Prepared pinned single-function patch and exact-definition rollback. No live changes.');
} else {
  const candidate: Candidate = JSON.parse(await readFile(`${root}/candidate.json`, 'utf8'));
  assert.equal(hash(patch), candidate.sourceHash);
  for (const [name, expectedHash] of Object.entries({ install: candidate.installHash,
    rehearse: candidate.rehearsalHash, rollback: candidate.rollbackHash })) {
    assert.equal(hash(await readFile(`${root}/${name}.sql`, 'utf8')), expectedHash);
  }
  if (mode === 'rehearse' || mode === 'apply') {
    assert.deepEqual(state(), candidate.before, 'Live state drifted; do not deploy');
    if (mode === 'apply') {
      const report = JSON.parse(await readFile('test-results/database/clean-room.json', 'utf8'));
      assert.equal(report.status, 'passed', 'Database regression required');
      assert.ok(report.migrations.some((m: { file?: string } | string) => JSON.stringify(m).includes('20261005020000')));
      const rehearsal = JSON.parse(await readFile(`${root}/rehearsed.json`, 'utf8'));
      assert.equal(rehearsal.installHash, candidate.installHash);
      assert.match(rehearsal.installedHash, /^[a-f0-9]{64}$/);
      const rollback = (await readFile(`${root}/rollback.sql`, 'utf8')).replace(
        `pg_get_functiondef(${target}) not like '%approval_options jsonb%'`,
        `encode(sha256(convert_to(pg_get_functiondef(${target}),'UTF8')),'hex')<>'${rehearsal.installedHash}'`,
      );
      await writeFile(`${root}/rollback-verified.sql`, rollback, { flag: 'wx' });
      await save('apply-started', { at: new Date().toISOString(), installHash: candidate.installHash });
    }
    const output = runFile(mode === 'apply' ? 'install' : 'rehearse');
    if (mode === 'rehearse') {
      assert.deepEqual(state(), candidate.before);
      const result = output as { rows: { installed_definition: string }[] };
      const definition = result.rows[0]?.installed_definition;
      assert.ok(typeof definition === 'string' && definition.includes('approval_options jsonb'));
      await save('rehearsed', { at: new Date().toISOString(), installHash: candidate.installHash,
        installedHash: hash(definition), exactRollback: true });
      console.log('Patch and exact rollback rehearsed in a rolled-back transaction; queued ideas unchanged.');
      process.exit(0);
    }
    await save('apply-result', { at: new Date().toISOString(), output });
  }
  const after = state();
  const rehearsal = JSON.parse(await readFile(`${root}/rehearsed.json`, 'utf8'));
  assert.equal(hash(after.definition), rehearsal.installedHash, 'Exact installed function must match rehearsal');
  assert.equal(after.protected, candidate.before.protected);
  assert.equal(after.queue, candidate.before.queue, 'Queued records changed; inspect independently');
  assert.match(after.definition, /approval_options jsonb/);
  assert.match(after.definition, /jsonb_array_elements_text\(approval_options\)/);
  await save(`verified-${Date.now()}`, { at: new Date().toISOString(), functionHash: hash(after.definition),
    protected: after.protected, queueUnchanged: true, noReviewCommandsExecuted: true });
  console.log('Live approval normalization verified; existing grants, RLS, other functions, triggers and queued ideas unchanged.');
}
