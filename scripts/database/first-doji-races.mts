import assert from 'node:assert/strict';
import { execFile, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { engine } from './config.mts';
import type { TestRoom } from './contracts.mts';

/** Real overlapping member commands, against the owned offline database only. */
export async function firstDojiRaces(
  room: TestRoom,
  rollback: string,
  verifyRewards?: (events: string[], actors: string[]) => void,
) {
  room.inspect();
  const actors = [randomUUID(), randomUUID()],
    challenge = randomUUID();
  const events = [randomUUID(), randomUUID()];
  const participants = events.map(() => [randomUUID(), randomUUID()]);
  const children = new Set<ChildProcess>();
  const sql = (value: string) => room.sql(`set role postgres;${value}`);
  const participant = (event: number, actor: number) => {
    const id = participants[event]?.[actor];
    assert.ok(id, 'Known synthetic participant required');
    return id;
  };
  const command = (event: number, actor: number) => `
    set local request.jwt.claims='{"sub":"${actors[actor]}","role":"authenticated"}';
    set local role authenticated;
    select public.complete_doji_with_post('${participant(event, actor)}','task_complete',
      'Synthetic race answer',null,null,null,'public','first-doji-race-${participant(event, actor)}');`;
  function start(source: string, hold = false) {
    const child = execFile(
      engine,
      [
        'exec',
        '-i',
        room.name,
        'psql',
        '-X',
        '-qAt',
        '-U',
        'postgres',
        '-d',
        'postgres',
        '-v',
        'ON_ERROR_STOP=1',
      ],
      { encoding: 'utf8', timeout: 30000 },
    );
    children.add(child);
    assert.ok(child.stdin && child.stdout && child.stderr);
    let out = '',
      err = '',
      signal!: () => void;
    const ready = new Promise<void>((resolve) => {
      signal = resolve;
    });
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('CLAIM_HELD')) signal();
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
    if (hold) child.stdin.write('\\echo CLAIM_HELD\n');
    else child.stdin.end('commit;');
    return { child, ready, done, stdin: child.stdin };
  }
  try {
    for (const [i, id] of actors.entries())
      sql(`
      insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data)
      values('${id}','authenticated','authenticated','${id}@test.invalid',now(),
        jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20',
        'terms_accepted_at',now(),'privacy_accepted_at',now()));
      insert into public.profiles(id,username,display_name,created_at) values('${id}','race_${id.slice(0, 8)}_${i}','Synthetic race member',now()-interval '7 days');`);
    sql(`insert into public.challenges(id,title,description,type,category,requires_text,requires_photo,requires_video)
      values('${challenge}','Synthetic race','Local only','task','creative',true,false,false);
      update first_doji_badges_private.settings set enabled_from=now()-interval '2 minutes';`);
    for (const [i, event] of events.entries()) {
      sql(`insert into public.daily_events(id,challenge_id,fires_at,activated_at,closes_at,window_minutes)
        values('${event}','${challenge}',now()-interval '1 minute',now()-interval '1 minute',now()+interval '9 minutes',10);`);
      for (const [actor, id] of actors.entries())
        sql(`
        insert into public.user_events(id,user_id,daily_event_id,status,expires_at)
        values('${participant(i, actor)}','${id}','${event}','pending',now()+interval '9 minutes');`);
    }
    for (const [i, decision] of (['commit', 'rollback'] as const).entries()) {
      const tag = `badge_race_${randomUUID()}`;
      const a = start(command(i, 0), true);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          a.ready,
          a.done.then(() => {
            throw Error('Claim exited early');
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('Claim setup timeout')), 12000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      const b = start(`set local application_name='${tag}';${command(i, 1)}`);
      // Attach immediately so a failing contender cannot become an unhandled rejection.
      const settled = Promise.allSettled([a.done, b.done]);
      let waiting = false;
      for (let n = 0; n < 25; n++) {
        waiting =
          sql(
            `select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock');`,
          ) === 't';
        if (waiting) break;
        await delay(40);
      }
      a.stdin.end(`${decision};`);
      const results = await settled;
      for (const result of results) if (result.status === 'rejected') throw result.reason;
      assert.ok(waiting, 'The contenders must genuinely overlap');
      assert.equal(
        sql(
          `select user_id from first_doji_badges_private.winners where daily_event_id='${events[i]}';`,
        ),
        actors[i],
      );
      // Repeating the actual completion RPC returns its receipt, never another win/reward.
      await start(command(i, i)).done;
      assert.equal(
        sql(`select wins from first_doji_badges_private.counts where user_id='${actors[i]}';`),
        '1',
      );
      assert.equal(
        sql(
          `select count(*) from public.spark_ledger where user_id='${actors[i]}' and ref_id='first_doji:bronze';`,
        ),
        '1',
      );
    }
    verifyRewards?.(events, actors);
    // Completion timestamps can be assigned before a competing transaction claims.
    // The visible celebration must prefer the committed canonical claim.
    sql(`update public.user_events set completed_at=(select fires_at+interval '1 second' from public.daily_events where id='${events[0]}')
      where id='${participant(0, 1)}';`);
    const visible = (actor: number, audience: string) =>
      JSON.parse(
        sql(`begin;
      set local request.jwt.claims='{"sub":"${actors[actor]}","role":"authenticated"}';
      set local role authenticated;
      select public.get_first_doji_v1('${events[0]}','${audience}');rollback;`),
      ) as { profile: { id: string } };
    assert.equal(visible(0, 'everyone').profile.id, actors[0]);
    assert.equal(visible(1, 'friends').profile.id, actors[1]);
    sql(`insert into public.blocks(blocker_id,blocked_id) values('${actors[1]}','${actors[0]}');`);
    assert.equal(visible(1, 'everyone').profile.id, actors[1]);
    const earned = () =>
      sql(`select jsonb_agg(to_jsonb(w) order by daily_event_id) from first_doji_badges_private.winners w;
      select jsonb_agg(to_jsonb(c) order by user_id) from first_doji_badges_private.counts c;
      select jsonb_agg(to_jsonb(p) order by user_id) from public.user_badge_progress p where category_id='first_doji';
      select jsonb_agg(to_jsonb(s) order by id) from public.spark_ledger s where ref_id like 'first_doji:%';`);
    const beforeRollback = earned();
    sql(rollback);
    assert.equal(earned(), beforeRollback, 'Rollback retains all winners, progress and Sparks');
    assert.equal(
      sql("select count(*) from pg_trigger where tgname='zz_first_doji_badge_completion';"),
      '0',
    );
    // Retention cannot move an already-awarded win to another participant.
    sql(`delete from public.posts where daily_event_id='${events[0]}';
      delete from public.user_events where daily_event_id='${events[0]}';
      delete from public.daily_events where id='${events[0]}';`);
    assert.equal(
      sql(`select wins from first_doji_badges_private.counts where user_id='${actors[0]}';`),
      '1',
    );
    sql(`delete from auth.users where id='${actors[0]}';`);
    assert.equal(
      sql(
        `select user_id is null from first_doji_badges_private.winners where daily_event_id='${events[0]}';`,
      ),
      't',
    );
    return 'PASS: overlapping real commands, rollback handoff, canonical visibility, replay, retaining rollback and retention';
  } finally {
    for (const child of children) {
      child.stdin?.destroy();
      child.kill();
    }
    sql(`update first_doji_badges_private.settings set enabled_from=null;
      delete from public.posts where daily_event_id in ('${events[0]}','${events[1]}');
      delete from public.user_events where daily_event_id in ('${events[0]}','${events[1]}');
      delete from public.daily_events where id in ('${events[0]}','${events[1]}');
      delete from public.challenges where id='${challenge}';
      delete from auth.users where id in ('${actors[0]}','${actors[1]}');
      delete from first_doji_badges_private.winners where daily_event_id in ('${events[0]}','${events[1]}');`);
  }
}
