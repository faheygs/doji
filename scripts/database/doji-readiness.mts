import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';

export function dojiReadiness(room: TestRoom) {
  room.inspect();
  const source = (file: string) =>
    readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const fingerprint = () =>
    sql(`select md5(coalesce(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid),''))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace and proname<>'inspect_doji_readiness_v1';`);
  const before = fingerprint();
  sql(source('overlays/doji_readiness_v1.sql'));
  const output = sql(source('tests/doji_readiness.sql'));
  assert.match(output, /PASS: readiness fixtures and member state rolled back/);
  assert.equal(fingerprint(), before);
  sql('update doji_readiness_private.settings set enabled=true;');
  sql(source('overlays/doji_readiness_v1.rollback.sql'));
  assert.equal(sql("select public.inspect_doji_readiness_v1(null)->>'enabled';"), 'false');
  assert.throws(() => sql('set role service_role;select public.inspect_doji_readiness_v1(null);'));
  assert.equal(fingerprint(), before);
  return 'Doji readiness: fixed occurrence reads, poll/window checks, bounded options, permissions, unchanged contracts and disabled rollback';
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2);
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(dojiReadiness(room));
  } finally {
    room.stop();
  }
}
