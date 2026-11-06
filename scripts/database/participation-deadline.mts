import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';
import { errorOutput } from './contracts.mts';

export function participationDeadline(room: TestRoom) {
  room.inspect();
  const source = (path: string) =>
    readFileSync(new URL(`../../supabase/${path}`, import.meta.url), 'utf8');
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const fingerprint = (excludeTarget: boolean) =>
    sql(`select md5(coalesce(string_agg(
    pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid),''))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace
    ${excludeTarget ? "and proname<>'sync_pending_event_expiry'" : ''};`);
  const before = fingerprint(false);
  const unrelated = fingerprint(true);
  const targetMetadata = () =>
    sql(`select jsonb_build_object('owner',proowner,'acl',proacl,
    'securityDefiner',prosecdef,'config',proconfig,'trigger',pg_get_triggerdef(t.oid))
    from pg_proc p join pg_trigger t on t.tgfoid=p.oid
    where p.oid='public.sync_pending_event_expiry()'::regprocedure;`);
  const metadata = targetMetadata();
  const fixture = source('tests/participation_deadline.sql');
  assert.throws(
    () => sql(fixture),
    (error) => {
      assert.match(errorOutput(error, 'stderr'), /pre-live signup grace survives activation/);
      return true;
    },
    'The original trigger must reproduce the observed pre-live deadline loss',
  );
  const overlay = source('overlays/participation_deadline_v1.sql');
  sql(overlay);
  const fixed = fingerprint(false);
  assert.notEqual(fixed, before);
  assert.equal(
    targetMetadata(),
    metadata,
    'Owner, grants, definer/search_path and trigger binding are unchanged',
  );
  assert.match(sql(fixture), /PASS: deadline fixtures rolled back/);
  sql(overlay);
  assert.equal(fingerprint(false), fixed, 'Reapplying the definition is idempotent');
  assert.equal(fingerprint(true), unrelated, 'No unrelated function or grant changes');
  sql(source('overlays/participation_deadline_v1.rollback.sql'));
  assert.equal(fingerprint(false), before, 'Retaining rollback restores the exact prior contracts');
  assert.equal(targetMetadata(), metadata);
  assert.equal(
    sql("select count(*) from auth.users where email like 'deadline-%@test.invalid';"),
    '0',
  );
  return 'Participation deadlines: original defect reproduced; pre/post-activation grace, normal recovery, paid/terminal isolation, close and retaining rollback passed';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets accepted');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(participationDeadline(room));
  } finally {
    room.stop();
  }
}
