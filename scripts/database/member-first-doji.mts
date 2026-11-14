import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';

export function memberFirstDoji(room: TestRoom) {
  room.inspect();
  const source = (path: string) =>
    readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const contracts = () =>
    JSON.parse(
      sql(`select jsonb_object_agg(oid::text,pg_get_functiondef(oid)||coalesce(proacl::text,''))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace;`),
    ) as Record<string, string>;
  const before = contracts();
  const policies = () =>
    sql(
      "select md5(string_agg(to_jsonb(p)::text,'|' order by schemaname,tablename,policyname)) from pg_policies p;",
    );
  const policyBefore = policies();
  assert.throws(() => sql(source('overlays/member_first_doji_v1.sql')));
  sql(source('overlays/member_first_doji_v1.indexes.sql'));
  // Match the hosted default grant rather than relying on a clean-room default.
  sql(
    'alter default privileges for role postgres in schema public grant execute on functions to service_role;',
  );
  sql(source('overlays/member_first_doji_v1.sql'));
  sql(source('overlays/member_first_doji_v1.sql'));
  sql(
    'alter default privileges for role postgres in schema public revoke execute on functions from service_role;',
  );
  assert.equal(
    sql(
      "select has_function_privilege('service_role','public.get_first_doji_v1(uuid,text)','execute');",
    ),
    'f',
    'First-Doji read must reject inherited service-role grants',
  );
  const output = sql(source('tests/member_first_doji.sql'));
  assert.match(
    output,
    /PASS: first Doji audience, all kinds, privacy, permissions and tie fixtures rolled back/,
  );
  const after = contracts();
  const plan = sql(`begin;set local enable_seqscan=off;explain select u.id from public.user_events u
    where u.daily_event_id='99630000-0000-4000-8000-000000000001' and u.status in ('completed','late')
    and u.completed_at is not null order by u.completed_at,u.id limit 1;rollback;`);
  assert.match(plan, /user_events_first_doji_v1_idx/);
  for (const [id, definition] of Object.entries(before)) assert.equal(after[id], definition);
  assert.equal(policies(), policyBefore);
  sql(source('overlays/member_first_doji_v1.rollback.sql'));
  assert.deepEqual(contracts(), before);
  assert.equal(sql("select to_regclass('public.user_events_first_doji_v1_idx') is null;"), 't');
  assert.equal(
    sql("select count(*) from auth.users where email like 'first-doji-%@test.invalid';"),
    '0',
  );
  return (
    output +
    '\nDependencies: ' +
    sql(`select jsonb_object_agg(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)))
    from pg_proc p where p.oid in ('public.can_view_full_post(uuid,uuid)'::regprocedure,
    'public.can_view_full_post(uuid,uuid,uuid,uuid,boolean)'::regprocedure,'public.can_access_daily_event(uuid,uuid)'::regprocedure);`)
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets accepted');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(memberFirstDoji(room));
  } finally {
    room.stop();
  }
}
