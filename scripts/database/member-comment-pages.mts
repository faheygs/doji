import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';
import { errorOutput } from './contracts.mts';

export function memberCommentPages(room: TestRoom) {
  room.inspect();
  const source = (name: string) =>
    readFileSync(new URL(`../../supabase/${name}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const original =
    sql(`select coalesce(jsonb_object_agg(oid::text,pg_get_functiondef(oid)||coalesce(proacl::text,'')),'{}')
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace;`);
  const originalFunctions = JSON.parse(original) as Record<string, string>;
  const count = sql('select count(*) from public.comments;');
  const overlay = source('overlays/member_comment_pages_v2.sql');
  const policies = () =>
    sql(
      "select md5(string_agg(to_jsonb(p)::text,'|' order by schemaname,tablename,policyname)) from pg_policies p;",
    );
  const originalPolicies = policies();
  assert.throws(
    () => sql(overlay),
    (error) => {
      assert.match(errorOutput(error, 'stderr'), /concurrent comment-page index first/);
      return true;
    },
  );
  sql(source('overlays/member_comment_pages_v2.indexes.sql'));
  // Hosted production grants service_role EXECUTE to new public functions by default.
  sql(
    'alter default privileges for role postgres in schema public grant execute on functions to service_role;',
  );
  sql(overlay);
  sql(overlay);
  sql(
    'alter default privileges for role postgres in schema public revoke execute on functions from service_role;',
  );
  for (const signature of [
    'public.get_comment_page_v2(uuid,text,uuid,timestamptz,uuid,text,integer)',
    'public.get_comment_rows_v2(uuid,uuid[],text)',
  ])
    assert.equal(
      sql(`select has_function_privilege('service_role','${signature}','execute');`),
      'f',
      'Member-only reads must reject inherited service-role grants',
    );
  assert.match(
    sql(source('tests/member_comment_pages.sql')),
    /PASS: 100K synthetic comment read fixture rolled back/,
  );
  const projection = () =>
    sql(
      "select pg_get_functiondef('comment_read_private.project_row(public.comments,uuid,text)'::regprocedure);",
    );
  const originalProjection = projection();
  sql(source('overlays/member_comment_reply_counts_v1.sql'));
  sql(source('overlays/member_comment_reply_counts_v1.sql'));
  const replyCounts = sql(source('tests/member_comment_reply_counts.sql'));
  assert.match(replyCounts, /PASS: exact reply counts and privacy rolled back/);
  console.log(replyCounts);
  sql(source('overlays/member_comment_reply_counts_v1.rollback.sql'));
  assert.equal(
    projection(),
    originalProjection,
    'Reply-count rollback restores the exact v2 projection',
  );
  const after = JSON.parse(
    sql(`select jsonb_object_agg(oid::text,pg_get_functiondef(oid)||coalesce(proacl::text,''))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace;`),
  ) as Record<string, string>;
  for (const [id, definition] of Object.entries(originalFunctions))
    assert.equal(after[id], definition);
  assert.equal(policies(), originalPolicies);
  sql(source('overlays/member_comment_pages_v2.rollback.sql'));
  assert.equal(sql('select count(*) from public.comments;'), count);
  assert.equal(
    sql(`select coalesce(jsonb_object_agg(oid::text,pg_get_functiondef(oid)||coalesce(proacl::text,'')),'{}')
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace;`),
    original,
  );
  assert.equal(sql("select to_regnamespace('comment_read_private') is null;"), 't');
  assert.equal(sql("select to_regclass('public.comments_thread_page_v2_idx') is null;"), 't');
  assert.equal(
    sql("select count(*) from auth.users where email like 'comment-scale-%@test.invalid';"),
    '0',
  );
  return 'Comment pages: 100K roots/replies, bidirectional cursors, permission boundaries, index plans and retaining rollback passed';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets accepted');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(memberCommentPages(room));
  } finally {
    room.stop();
  }
}
