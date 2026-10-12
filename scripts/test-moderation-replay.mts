import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { errorOutput } from './database/contracts.mts';
import { patchModeration, signatures } from './moderation-replay-patch.mts';
import { moderationReplayConcurrency } from './database/moderation-replay-concurrency.mts';
const room = createCleanRoom();
const root = 'test-results/moderation-replay-release';
const results: string[] = [];
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const hash = (value: string) => createHash('md5').update(value).digest('hex');
const q = (value: string) => "'" + value.replaceAll("'", "''") + "'";
try {
  await room.start();
  installManagedSchemas(room);
  await replay(room);
  const replayed = signatures.map((s) =>
    room.sql(`select pg_get_functiondef(${q(s)}::regprocedure);`),
  );
  const capture = JSON.parse(read(`${root}/before.json`)) as {
    targets: { signature: string; definition: string; hash: string }[];
  };
  const prior: string[] = [];
  const candidate = replayed.map((definition, i) => {
    const live = capture.targets.find(
      (t) => 'public.' + t.signature.replaceAll(', ', ',') === signatures[i],
    );
    assert.ok(live, 'Live target captured');
    const patched = patchModeration(live.definition, i === 1);
    assert.equal(
      definition.trim(),
      (definition.includes('MODERATION_OUTER_REPLAY_V1') ? patched : live.definition).trim(),
      'Replayed migration must match the exact qualified definition',
    );
    prior.push(live.definition.trim());
    return patched;
  });
  const grants = room.sql(
    `select jsonb_agg(jsonb_build_array(oid,proowner,proacl) order by oid) from pg_proc where oid in (${signatures.map((s) => q(s) + '::regprocedure').join(',')});`,
  );
  room.sql(candidate.join(';\n'));
  assert.equal(
    room.sql(
      `select jsonb_agg(jsonb_build_array(oid,proowner,proacl) order by oid) from pg_proc where oid in (${signatures.map((s) => q(s) + '::regprocedure').join(',')});`,
    ),
    grants,
  );
  results.push('Exact captured live definitions patched offline; owners and grants preserved');
  room.sql(`insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values
    ('91000000-0000-4000-8000-000000000001','authenticated','authenticated','member-one@test.invalid',now(),'{}');
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data) values
    ('91000000-0000-4000-8000-000000000003','authenticated','doji_employee','staff@test.invalid',now(),'{"account_type":"employee"}','{}');
    insert into public.admin_employees(id,display_name,status,roles) values
    ('91000000-0000-4000-8000-000000000003','Synthetic retry employee','active',array['super_admin']);
    update public.admin_employee_cutover set employee_only=true;`);
  process.env.DOJI_CLEAN_ROOM_CONTAINER = room.name;
  const { employeeEvidenceSetup } = await import('./test-employee-local-evidence.mts');
  for (const consequence of ['temporary_restriction', 'permanent_ban']) {
    room.sql(
      employeeEvidenceSetup +
        `select set_config('test.consequence',${q(consequence)},true);
      select set_config('test.days',${q(consequence === 'temporary_restriction' ? '1' : '')},true);` +
        read('scripts/test-moderation-replay.sql'),
    );
    results.push(
      `${consequence}: exact/historical replay, changed payload denial, real reversal, subsequent removal, no reactivation/restoration, permissions and receipt isolation`,
    );
  }
  results.push(...(await moderationReplayConcurrency(room, employeeEvidenceSetup)));
  // Qualified rollback restores exact definitions, owners and ACLs, not just behavior.
  room.sql(prior.join(';\n'));
  for (const [i, signature] of signatures.entries())
    assert.equal(room.sql(`select pg_get_functiondef(${q(signature)}::regprocedure);`), prior[i]);
  room.sql(candidate.join(';\n'));
  results.push('Exact definition rollback and reapply passed');
  mkdirSync(root, { recursive: true });
  writeFileSync(`${root}/candidate.json`, JSON.stringify(candidate));
  writeFileSync(
    `${root}/local-result.json`,
    JSON.stringify(
      {
        at: new Date().toISOString(),
        results,
        candidateHashes: candidate.map(hash),
        installedHashes: signatures.map((s) =>
          room.sql(`select md5(pg_get_functiondef(${q(s)}::regprocedure));`),
        ),
      },
      null,
      2,
    ),
  );
  console.log(results.join('\n'));
} catch (error) {
  console.error(errorOutput(error, 'stderr') || (error as Error).message);
  process.exitCode = 1;
} finally {
  room.stop();
  console.log('Owned offline container removed.');
}
