import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { TestRoom } from './contracts.mts';

export async function socialPhoneAlerts(room: TestRoom) {
  room.inspect();
  const source = (file: string) => readFileSync(new URL(`../../supabase/${file}`, import.meta.url), 'utf8');
  const sql = (text: string) => room.sql(`set role postgres;${text}`);
  const signatures = ['enforce_os_push_policy', 'process_friend_fanout_event',
    'claim_push_delivery_targets_batch_v2'];
  const fingerprint = () => sql(`select md5(string_agg(pg_get_functiondef(oid)||coalesce(proacl::text,''),'|' order by oid))
    from pg_proc where prokind='f' and pronamespace='public'::regnamespace
    and proname in (${signatures.map(s => `'${s}'`).join(',')});`);
  const before = fingerprint();
  for (const part of ['', '.delivery', '.bindings']) sql(source(`overlays/social_phone_alerts_v1${part}.sql`));
  const installed = fingerprint();
  assert.notEqual(installed, before);
  sql(source('overlays/social_phone_alerts_v1.bindings.sql'));
  assert.equal(fingerprint(), installed, 'Bindings replay is idempotent');
  const output = sql(source('tests/social_phone_alerts.sql'));
  assert.match(output, /PASS: social phone alerts rolled back/);
  const { socialPhoneConcurrency } = await import('./social-phone-alerts-concurrency.mts');
  await socialPhoneConcurrency(room);
  sql(source('overlays/social_phone_alerts_v1.rollback.sql'));
  assert.equal(fingerprint(), before, 'Rollback restores exact delivery definitions and ACLs');
  assert.equal(sql("select pg_get_functiondef('public.update_own_profile(jsonb,text)'::regprocedure) like '%comments_on_posts%';"),
    't', 'Preference compatibility survives rollback');
  assert.equal(sql('select enabled from social_notification_private.configuration;'), 'f');
  return 'Social phone alerts: gated batching, privacy, duplicate suppression, preferences and retaining rollback passed';
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets accepted');
  const { createCleanRoom, installManagedSchemas, replay } = await import('./clean-room.mts');
  const room = createCleanRoom();
  try {
    await room.start();
    installManagedSchemas(room);
    await replay(room);
    console.log(await socialPhoneAlerts(room));
  } finally { room.stop(); }
}
