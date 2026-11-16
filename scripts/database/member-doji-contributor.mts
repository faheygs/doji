import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';

export function memberDojiContributor(room: TestRoom) {
  room.inspect();
  const source = (path: string) =>
    readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const baseline = () =>
    sql(`select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace and proname<>'get_doji_contributor_v1';`);
  const policies = () =>
    sql(
      `select md5(string_agg(to_jsonb(p)::text,'|' order by schemaname,tablename,policyname)) from pg_policies p;`,
    );
  const before = baseline(),
    policyBefore = policies();
  assert.throws(() => sql(source('overlays/member_doji_contributor_v1.sql')));
  sql(source('overlays/member_doji_contributor_v1.indexes.sql'));
  sql(
    'alter default privileges for role postgres in schema public grant execute on functions to service_role;',
  );
  sql(source('overlays/member_doji_contributor_v1.sql'));
  sql(source('overlays/member_doji_contributor_v1.sql'));
  sql(
    'alter default privileges for role postgres in schema public revoke execute on functions from service_role;',
  );
  const output = sql(source('tests/member_doji_contributor.sql'));
  assert.match(output, /PASS: contributor fixtures rolled back/);
  assert.equal(baseline(), before);
  assert.equal(policies(), policyBefore);
  const plan =
    sql(`begin;set local enable_seqscan=off;explain select suggestion_id from public.admin_suggestion_reviews
    where challenge_id='99720000-0000-4000-8000-000000000001' order by suggestion_id limit 2;rollback;`);
  assert.match(plan, /admin_suggestion_contributor_v1_idx/);
  sql(source('overlays/member_doji_contributor_v1.rollback.sql'));
  assert.equal(baseline(), before);
  assert.equal(sql("select to_regprocedure('public.get_doji_contributor_v1(uuid)') is null;"), 't');
  assert.equal(
    sql("select to_regclass('public.admin_suggestion_contributor_v1_idx') is null;"),
    't',
  );
  assert.equal(
    sql("select count(*) from auth.users where email like 'contributor-%@test.invalid';"),
    '0',
  );
  return 'Contributor: all types, safe projection, audience/privacy, ambiguity, grants, index and retaining rollback passed';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets accepted');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(memberDojiContributor(room));
  } finally {
    room.stop();
  }
}
