import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { engine } from './config.mts';
import type { TestRoom } from './contracts.mts';

/** Two real transactions contend on the first recipient/subject batch. No remote sockets. */
export async function socialPhoneConcurrency(room: TestRoom, category = 'comments_on_posts', trailing = false) {
  room.inspect();
  const viewer = '99790000-0000-4000-8000-000000000001';
  const subject = '99790000-0000-4000-8000-000000000002';
  const actor = '99790000-0000-4000-8000-000000000003';
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  sql(`insert into auth.users(id,email,raw_user_meta_data) values('${viewer}','social-race@test.invalid',
    jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
      'terms_accepted_at',now(),'privacy_accepted_at',now()));
    insert into public.profiles(id,username,display_name,notification_preferences)
      values('${viewer}','social_race','Synthetic race','{"comments_on_posts":true}');
    update social_notification_private.configuration set enabled=true;`);
  const children: ReturnType<typeof execFile>[] = [];
  assert.ok(['comments_on_posts', 'late_friend_participation'].includes(category));
  const command = (id: number) => `select social_notification_private.enqueue('${category}','${viewer}',
    '${subject}','99790000-0000-4000-8000-${String(id).padStart(12, '0')}','${actor}',clock_timestamp());`;
  if (trailing) sql(`${command(9)}update social_notification_private.batches
    set sealed_at=clock_timestamp(),due_at=clock_timestamp() where recipient='${viewer}';`);
  const start = (query: string, hold: boolean) => {
    let ready!: () => void;
    const pending = new Promise<void>(resolve => { ready = resolve; });
    let output = '';
    let finish!: () => void;
    const completed = new Promise<void>(resolve => { finish = resolve; });
    const child = execFile(engine, ['exec', '-i', room.name, 'psql', '-X', '-qAt', '-U', 'postgres',
      '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { timeout: 15000 }, (error, _stdout, stderr) => {
        output = error ? `${error.message}: ${stderr}` : ''; finish();
      });
    children.push(child);
    child.stdout?.on('data', chunk => { if (String(chunk).includes('SOCIAL_LOCK_HELD')) ready(); });
    child.stdin?.write(`begin;set local statement_timeout='10s';${query}\n`);
    if (hold) child.stdin?.write('\\echo SOCIAL_LOCK_HELD\n');
    else child.stdin?.end('commit;');
    return { child, pending, completed, error: () => output };
  };
  try {
    const first = start(command(10), true);
    await Promise.race([first.pending, first.completed.then(() => { throw Error(first.error() || 'Missing race barrier'); })]);
    const second = start(`set local application_name='doji_social_phone_race';${command(11)}${command(10)}`, false);
    let waiting = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      waiting = sql("select exists(select 1 from pg_stat_activity where application_name='doji_social_phone_race' and wait_event_type='Lock');") === 't';
      if (waiting) break;
      await delay(50);
    }
    assert.ok(waiting, 'Second producer contends on the same stream lock');
    first.child.stdin?.end('commit;');
    await Promise.all([first.completed, second.completed]);
    assert.equal(first.error(), ''); assert.equal(second.error(), '');
    assert.equal(sql(`select count(*) from social_notification_private.batches where recipient='${viewer}';`), trailing ? '2' : '1');
    assert.equal(sql(`select count(*) from social_notification_private.items i join social_notification_private.batches b
      on b.id=i.batch_id where b.recipient='${viewer}';`), trailing ? '3' : '2', 'Concurrent retry does not inflate counts');
    if (trailing) assert.equal(sql(`select count(*) from social_notification_private.items i
      join social_notification_private.batches b on b.id=i.batch_id
      where b.recipient='${viewer}' and b.sealed_at is null;`), '2', 'Concurrent follow-ups survive spacing exactly once');
  } finally {
    for (const child of children) if (child.exitCode === null) { child.stdin?.end('rollback;'); child.kill(); }
    sql(`delete from public.domain_event_outbox where id in(select outbox_id from social_notification_private.batches where recipient='${viewer}');
      delete from public.notification_once_keys where delivery_key like 'social-phone-v1:${category}:${viewer}:%';
      delete from auth.users where id='${viewer}';
      update social_notification_private.configuration set enabled=false;`);
  }
}
