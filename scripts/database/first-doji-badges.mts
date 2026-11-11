import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';

export async function firstDojiBadges(room: TestRoom) {
  room.inspect();
  const source = (path: string) =>
    readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  sql(source('overlays/member_first_doji_v1.indexes.sql'));
  sql(source('overlays/member_first_doji_v1.sql'));
  const readId = sql("select 'public.get_first_doji_v1(uuid,text)'::regprocedure::oid;");
  const readAcl = () => sql(`select coalesce(proacl::text,'') from pg_proc where oid=${readId};`);
  const aclBefore = readAcl();
  const policies = () =>
    sql(
      "select md5(string_agg(to_jsonb(p)::text,'|' order by schemaname,tablename,policyname)) from pg_policies p;",
    );
  const policyBefore = policies();
  const contracts = () =>
    JSON.parse(
      sql(`select jsonb_object_agg(oid::text,pg_get_functiondef(oid)||coalesce(proacl::text,''))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace;`),
    ) as Record<string, string>;
  const before = contracts();
  sql(source('overlays/first_doji_badges_v1.sql'));
  const visibility = sql(source('tests/member_first_doji.sql'));
  assert.match(
    visibility,
    /PASS: first Doji audience, all kinds, privacy, permissions and tie fixtures rolled back/,
  );
  sql(source('overlays/first_doji_badges_v1.sql'));
  const output = sql(source('tests/first_doji_badges.sql'));
  assert.match(output, /PASS: first-Doji milestones/);
  const { firstDojiRaces } = await import('./first-doji-races.mts');
  const races = await firstDojiRaces(room, source('overlays/first_doji_badges_v1.rollback.sql'));
  const after = contracts();
  for (const [id, body] of Object.entries(before)) if (id !== readId) assert.equal(after[id], body);
  assert.equal(readAcl(), aclBefore);
  assert.equal(policies(), policyBefore);
  sql(source('overlays/first_doji_badges_v1.rollback.sql'));
  assert.equal(
    sql('select enabled_from is null from first_doji_badges_private.settings where singleton;'),
    't',
  );
  assert.equal(
    sql("select count(*) from pg_trigger where tgname='zz_first_doji_badge_completion';"),
    '0',
  );
  assert.equal(sql("select count(*) from public.badge_tiers where category_id='first_doji';"), '4');
  return (
    output
      .split('\n')
      .filter((line) => line.startsWith('PASS:'))
      .join('\n') +
    '\n' +
    races
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
    console.log(await firstDojiBadges(room));
  } finally {
    room.stop();
  }
}
