import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';
import { errorOutput } from './contracts.mts';

export function memberFeedCursorOrder(room: TestRoom) {
  room.inspect();
  const source = (path: string) =>
    readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const signature = 'public.get_feed_page_snapshot_v2(uuid,text,integer,timestamptz,uuid)';
  const definition = () => sql(`select pg_get_functiondef('${signature}'::regprocedure);`);
  const metadata = () =>
    sql(`select jsonb_build_object('owner',proowner,'acl',proacl,
    'securityDefiner',prosecdef,'config',proconfig) from pg_proc where oid='${signature}'::regprocedure;`);
  const unrelated = () =>
    sql(`select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace and oid<>'${signature}'::regprocedure;`);
  const before = definition(),
    grants = metadata(),
    others = unrelated();
  const fixture = source('tests/member_feed_cursor_order.sql');
  assert.throws(
    () => sql(fixture),
    (error) => {
      assert.match(errorOutput(error, 'stderr'), /complete descending cursor/);
      return true;
    },
  );
  const overlay = source('overlays/member_feed_cursor_order_v1.sql');
  const rollback = source('overlays/member_feed_cursor_order_v1.rollback.sql');
  sql(overlay);
  const fixed = definition();
  assert.equal(
    fixed,
    before
      .replace(') post, page.post_created_at', ') post, page.post_created_at, page.post_id')
      .replace(
        'jsonb_agg(post order by post_created_at desc)',
        'jsonb_agg(post order by post_created_at desc, post_id desc)',
      ),
  );
  assert.equal(metadata(), grants);
  assert.match(sql(fixture), /PASS: feed cursor fixtures rolled back/);
  assert.match(
    sql(fixture.replace(/set local enable_(hashjoin|nestloop|hashagg)=off;/g, '')),
    /PASS: feed cursor fixtures rolled back/,
    'The default planner produces the same complete cursor sequence',
  );
  sql(overlay);
  assert.equal(definition(), fixed, 'Repeated installation is a no-op');
  sql(fixed.replace('declare uid uuid', '-- unreviewed body\ndeclare uid uuid'));
  for (const action of [overlay, rollback]) {
    assert.throws(
      () => sql(action),
      (error) => {
        assert.match(
          errorOutput(error, 'stderr'),
          /Unexpected feed reader|Intervening feed reader change/,
        );
        return true;
      },
    );
  }
  sql(fixed);
  sql(rollback);
  sql(rollback);
  assert.equal(definition(), before, 'Rollback restores exact definition');
  assert.equal(metadata(), grants);
  assert.equal(unrelated(), others, 'Other functions and grants unchanged');
  assert.equal(
    sql("select count(*) from auth.users where email like 'feed-order-%@test.invalid';"),
    '0',
  );
  return 'Feed cursor: reproduced tied-order failure; complete traversal, visibility, body guards and exact rollback passed';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets accepted');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(memberFeedCursorOrder(room));
  } finally {
    room.stop();
  }
}
