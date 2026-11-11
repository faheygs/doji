import assert from 'node:assert/strict';
import { execFile, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { engine } from './config.mts';
import type { TestRoom } from './contracts.mts';

/** Separate connections race actual comment inserts against the per-occurrence cap. */
export async function sparksSocialRaces(room: TestRoom) {
  room.inspect();
  const actors = [randomUUID(), randomUUID(), randomUUID()];
  const challenge = randomUUID(),
    events = [randomUUID(), randomUUID()];
  const children = new Set<ChildProcess>();
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  function start(source: string, hold = false) {
    const child = execFile(
      engine,
      ['exec', '-i', room.name, 'psql', '-X', '-qAt', '-U', 'postgres', '-v', 'ON_ERROR_STOP=1'],
      { encoding: 'utf8', timeout: 30000 },
    );
    children.add(child);
    assert.ok(child.stdin && child.stdout && child.stderr);
    let out = '',
      err = '',
      ready!: () => void;
    const held = new Promise<void>((resolve) => {
      ready = resolve;
    });
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('HELD')) ready();
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    const done = new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', (code) => {
        children.delete(child);
        if (code === 0) resolve();
        else reject(Error(err));
      });
    });
    child.stdin.write(
      `begin;set local statement_timeout='15s';set local lock_timeout='12s';${source}\n`,
    );
    if (hold) child.stdin.write('\\echo HELD\n');
    else child.stdin.end('commit;');
    return { held, done, stdin: child.stdin };
  }
  try {
    for (const actor of actors)
      sql(`insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
      values('${actor}','authenticated','authenticated','${actor}@test.invalid',now(),
        jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()));
      insert into public.profiles(id,username,display_name,created_at) values('${actor}','cap_${actor.slice(0, 8)}','Synthetic cap member',now()-interval '7 days');`);
    sql(`insert into public.challenges(id,title,description,type,category,requires_text,requires_photo,requires_video)
      values('${challenge}','Synthetic cap race','Offline only','task','creative',true,false,false);`);
    for (const [index, event] of events.entries()) {
      const posts = actors.map(() => randomUUID());
      sql(`insert into public.daily_events(id,challenge_id,fires_at,activated_at,closes_at,window_minutes)
        values('${event}','${challenge}',now()-interval '30 seconds',now()-interval '30 seconds',now()+interval '9 minutes',10);`);
      for (const [i, actor] of actors.entries()) {
        const participant = randomUUID();
        sql(`insert into public.user_events(id,user_id,daily_event_id,status,expires_at)
          values('${participant}','${actor}','${event}','pending',now()+interval '9 minutes');
          insert into public.posts(id,user_event_id,user_id,daily_event_id,type,visibility,caption)
          values('${posts[i]}','${participant}','${actor}','${event}','task_complete','public','Synthetic answer');
          update public.user_events set status='completed',completed_at=clock_timestamp() where id='${participant}';`);
      }
      const command = (post: string) =>
        `insert into public.comments(user_id,post_id,body) values('${actors[2]}','${post}','Synthetic cap comment');`;
      const a = start(command(posts[0]!), true);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          a.held,
          a.done.then(() => {
            throw Error('Contender exited before hold');
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('Setup timeout')), 12000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      const tag = `economy_cap_${randomUUID()}`;
      const b = start(`set local application_name='${tag}';${command(posts[1]!)}`);
      const settled = Promise.allSettled([a.done, b.done]);
      let waiting = false;
      for (let i = 0; i < 25; i++) {
        waiting =
          sql(
            `select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock');`,
          ) === 't';
        if (waiting) break;
        await delay(40);
      }
      a.stdin.end(index === 0 ? 'commit;' : 'rollback;');
      for (const result of await settled) if (result.status === 'rejected') throw result.reason;
      assert.ok(waiting, 'Real overlap required');
      const total = () =>
        sql(
          `select earned from sparks_economy_v2_private.social_totals where user_id='${actors[2]}' and daily_event_id='${event}';`,
        );
      assert.equal(total(), '3', 'Two 3-Spark comments must not exceed the 5-Spark cap');
      const rewardPost = posts[index]!;
      sql(`insert into public.reactions(user_id,post_id,emoji) values('${actors[2]}','${rewardPost}','fire');
        delete from public.reactions where user_id='${actors[2]}' and post_id='${rewardPost}';
        insert into public.reactions(user_id,post_id,emoji) values('${actors[2]}','${rewardPost}','fire');`);
      assert.equal(total(), '5', 'Reaction delete/reinsert cannot mint again');
    }
    return 'PASS: concurrent social cap, rollback handoff and reaction replay';
  } finally {
    for (const child of children) {
      child.stdin?.destroy();
      child.kill();
    }
    sql(`delete from public.posts where daily_event_id in('${events[0]}','${events[1]}');
      delete from public.user_events where daily_event_id in('${events[0]}','${events[1]}');
      delete from public.daily_events where id in('${events[0]}','${events[1]}');
      delete from public.challenges where id='${challenge}';
      delete from auth.users where id in('${actors[0]}','${actors[1]}','${actors[2]}');
      delete from first_doji_badges_private.winners where daily_event_id in('${events[0]}','${events[1]}');`);
  }
}
