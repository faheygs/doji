import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';
import { errorOutput } from './contracts.mts';

export function memberProfileSearch(room: TestRoom) {
  room.inspect();
  const source = (path: string) =>
    readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const fingerprint = (excludeTarget: boolean) =>
    sql(`select md5(string_agg(
    pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace
    ${excludeTarget ? "and proname<>'search_profiles'" : ''};`);
  const metadata = () =>
    sql(`select jsonb_build_object('owner',proowner,'acl',proacl,
    'securityDefiner',prosecdef,'config',proconfig)
    from pg_proc where oid='public.search_profiles(text,integer)'::regprocedure;`);
  const before = fingerprint(false),
    unrelated = fingerprint(true),
    grants = metadata();
  const fixture = source('tests/member_profile_search.sql');
  assert.throws(
    () => sql(fixture),
    (error) => {
      assert.match(errorOutput(error, 'stderr'), /first name prefix matches/);
      return true;
    },
  );
  const overlay = source('overlays/member_profile_search_v1.sql');
  sql(overlay);
  const fixed = fingerprint(false);
  assert.notEqual(fixed, before);
  assert.equal(metadata(), grants, 'Existing owner, grants and definer configuration unchanged');
  assert.match(sql(fixture), /PASS: member search fixtures rolled back/);
  const plan = sql(`begin;set local enable_seqscan=off;explain select id from public.profiles
    where to_tsvector('simple',coalesce(display_name,'')) @@ '''alex'':*'::tsquery;rollback;`);
  assert.match(plan, /profiles_display_name_search_v1_idx/);
  sql(overlay);
  assert.equal(fingerprint(false), fixed);
  assert.equal(fingerprint(true), unrelated);
  sql(source('overlays/member_profile_search_v1.rollback.sql'));
  assert.equal(fingerprint(false), before, 'Rollback restores exact prior function and ACL');
  assert.equal(metadata(), grants);
  assert.equal(
    sql("select count(*) from auth.users where email like 'search-fixture-%@test.invalid';"),
    '0',
  );
  assert.equal(
    sql("select to_regclass('public.profiles_display_name_search_v1_idx') is null;"),
    't',
  );
  return 'Member search: indexed names, literal usernames, safe projection, exclusion rules, bounds and exact rollback passed';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets accepted');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(memberProfileSearch(room));
  } finally {
    room.stop();
  }
}
