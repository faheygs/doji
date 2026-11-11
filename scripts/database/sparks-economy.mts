import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';
import { errorOutput } from './contracts.mts';
import { randomUUID } from 'node:crypto';

export async function sparksEconomy(room: TestRoom) {
  room.inspect();
  const source = (name: string) =>
    readFileSync(new URL(`../../supabase/${name}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  sql(source('overlays/member_first_doji_v1.indexes.sql'));
  sql(source('overlays/member_first_doji_v1.sql'));
  sql(source('overlays/first_doji_badges_v1.sql'));
  const contracts = () =>
    sql(`select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace;`);
  const before = contracts();
  const policies = () =>
    sql(
      "select md5(string_agg(to_jsonb(p)::text,'|' order by schemaname,tablename,policyname)) from pg_policies p;",
    );
  const policyBefore = policies();
  sql(source('overlays/sparks_economy_v2.sql') + source('overlays/sparks_economy_v2.bindings.sql'));
  try {
    const output = sql(source('tests/sparks_economy_v2.sql'));
    assert.match(output, /PASS: economy timing/);
    assert.equal(policies(), policyBefore);
    assert.equal(sql('select count(*) from sparks_economy_v2_private.receipts;'), '0');
    sql("update sparks_economy_v2_private.settings set enabled_from=now()-interval '1 hour';");
    const { sparksSocialRaces } = await import('./sparks-economy-races.mts');
    const socialResult = await sparksSocialRaces(room);
    const { firstDojiRaces } = await import('./first-doji-races.mts');
    await firstDojiRaces(
      room,
      source('overlays/first_doji_badges_v1.rollback.sql'),
      (events, actors) => {
        for (const [index, event] of events.entries()) {
          assert.equal(
            sql(
              `select count(*) from public.spark_ledger where ref_id='economy_v2:first:${event}';`,
            ),
            '1',
          );
          assert.equal(
            sql(
              `select user_id from public.spark_ledger where ref_id='economy_v2:first:${event}';`,
            ),
            actors[index],
          );
        }
        assert.equal(
          sql("select count(*) from sparks_economy_v2_private.receipts where kind='completion';"),
          '3',
        );
      },
    );
    const model = sql(readFileSync(new URL('./sparks-economy-model.sql', import.meta.url), 'utf8'));
    const retainedActor = randomUUID(),
      retainedSubject = randomUUID();
    sql(`insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
      values('${retainedActor}','authenticated','authenticated','${retainedActor}@test.invalid',now(),
      jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()));
      insert into public.profiles(id,username,display_name) values('${retainedActor}','keep_${retainedActor.slice(0, 8)}','Synthetic retained reward');
      select sparks_economy_v2_private.claim('${retainedActor}','completion','${retainedSubject}',20,'challenge_complete');`);
    const retained = () =>
      sql(`select sparks from public.profiles where id='${retainedActor}';
      select row_to_json(r) from sparks_economy_v2_private.receipts r where user_id='${retainedActor}';
      select jsonb_agg(to_jsonb(l) order by id) from public.spark_ledger l where user_id='${retainedActor}';`);
    const earned = retained();
    assert.throws(
      () =>
        sql(`begin;alter function public.trg_sparks_post() cost 101;
      ${source('overlays/sparks_economy_v2.rollback.sql')}`),
      'Rollback refuses intervening changes',
    );
    sql(source('overlays/sparks_economy_v2.rollback.sql'));
    assert.equal(retained(), earned, 'Rollback keeps balances, ledger and duplicate fences');
    sql(`delete from auth.users where id='${retainedActor}';`);
    assert.equal(contracts(), before, 'Exact public function bodies and ACLs restored');
    assert.equal(sql('select enabled_from is null from sparks_economy_v2_private.settings;'), 't');
    return (
      output
        .split('\n')
        .filter((line) => line.startsWith('PASS:'))
        .join('\n') +
      '\n' +
      socialResult +
      '\nMODEL:' +
      model
    );
  } catch (error) {
    throw Error(errorOutput(error, 'stderr'));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'Only an owned offline database is supported');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(await sparksEconomy(room));
  } finally {
    room.stop();
  }
}
