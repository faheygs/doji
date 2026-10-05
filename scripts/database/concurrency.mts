import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type { TestRoom } from './contracts.mts';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { member, other, staff, quote, claims } from './integration.mts';

type CommandResult = { code: number | null; out: string; err: string };

export async function concurrency(room: TestRoom, engine: string) {
  const checks: string[] = [];
  const pass = (label: string) => {
    checks.push(label);
    console.log(`PASS: ${label}`);
  };
  const children = new Set<ChildProcess>();
  function start(sql: string, hold = false) {
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
    assert.ok(child.stdin && child.stdout && child.stderr, 'SQL process requires piped streams');
    const stdin = child.stdin;
    let out = '',
      err = '',
      readyResolve: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('LOCK_HELD')) readyResolve?.();
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    const done = new Promise<CommandResult>((resolve) => {
      child.on('error', (error) => {
        children.delete(child);
        resolve({ code: -1, out, err: error.message });
      });
      child.on('close', (code) => {
        children.delete(child);
        resolve({ code, out, err });
      });
    });
    child.stdin.write(
      `begin;set local statement_timeout='10s';set local lock_timeout='8s';${sql}\n`,
    );
    if (hold) child.stdin.write('\\echo LOCK_HELD\n');
    else child.stdin.end('commit;');
    return { child, stdin, ready, done };
  }
  async function overlap(first: string, second: string) {
    const tag = `doji_test_${randomUUID().replaceAll('-', '')}`;
    const a = start(first, true);
    try {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          a.ready,
          a.done.then((r) => {
            throw Error(`First command failed: ${r.err}`);
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(Error('Lock setup timeout')), 10000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
      const b = start(`set local application_name='${tag}';${second}`);
      let waiting = false;
      for (let n = 0; n < 25; n++) {
        waiting =
          room.sql(
            `select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock');`,
          ) === 't';
        if (waiting) break;
        await delay(40);
      }
      assert.ok(waiting, 'The competing connection must actually wait on a database lock');
      a.stdin.end('commit;');
      const left = await a.done;
      const right = await b.done;
      assert.equal(left.code, 0, left.err);
      return right;
    } finally {
      if (!a.stdin.destroyed && !a.stdin.writableEnded) a.stdin.end('rollback;');
    }
  }
  const good = (result: CommandResult) => assert.equal(result.code, 0, result.err);
  try {
    room.inspect();
    room.sql(`update auth.users set raw_user_meta_data=jsonb_build_object('terms_version','2026-08-20',
      'privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()) where id in ('${member}','${other}');
      insert into public.profiles(id,username,display_name) values ('${member}','race_member','Synthetic race member'),('${other}','race_other','Synthetic other');
      select public.award_sparks_once('${member}',2000,'admin_grant','synthetic-race-seed');
      insert into public.shop_items(key,kind,name,price) values ('test_race_theme','theme','Synthetic test item',200),('test_rollback_theme','theme','Synthetic rollback item',200);`);
    const balance = Number(room.sql(`select sparks from public.profiles where id='${member}';`));
    const purchase = `${claims(member)}select public.purchase_shop_item('test_race_theme');`;
    good(await overlap(purchase, purchase));
    assert.equal(
      room.sql(
        `select count(*) from public.user_shop_items where user_id='${member}' and item_key='test_race_theme';`,
      ),
      '1',
    );
    assert.equal(
      Number(room.sql(`select sparks from public.profiles where id='${member}';`)),
      balance - 200,
    );
    assert.equal(
      room.sql(
        `select count(*) from public.spark_ledger where user_id='${member}' and reason='purchase' and ref_id='test_race_theme';`,
      ),
      '1',
    );
    pass('Overlapping purchases commit one ownership and one debit');

    const before = room.sql(
      `select sparks from public.profiles where id='${member}';select count(*) from public.spark_ledger;select count(*) from public.domain_event_outbox;`,
    );
    const failed = await start(
      `${claims(member)}select public.purchase_shop_item('test_rollback_theme');select 1/0;`,
    ).done;
    assert.notEqual(failed.code, 0);
    assert.match(failed.err, /division by zero/);
    assert.equal(
      room.sql(
        `select sparks from public.profiles where id='${member}';select count(*) from public.spark_ledger;select count(*) from public.domain_event_outbox;`,
      ),
      before,
    );
    assert.equal(
      room.sql("select count(*) from public.user_shop_items where item_key='test_rollback_theme';"),
      '0',
    );
    pass('Injected failure rolls back purchase, balance, ledger and outbox together');

    const reward =
      "jsonb_build_object('title','Synthetic campaign','body','Local test only','starts_at',now()-interval '1 hour','ends_at',now()+interval '1 hour','priority',0,'max_impressions_per_user',1,'min_hours_between_impressions',1,'cta_label','Submit an idea','cta_url','/(app)/suggest-challenge','reward_action','submit_idea','reward_sparks',500)";
    room.sql(`begin;${claims(staff, 'doji_employee', 'aal2')}
      do $$declare a jsonb;begin
      a:=public.admin_editorial_command_v1('announcements','create',null,null,${reward},'Synthetic concurrency test','test-race-create');
      perform public.admin_editorial_command_v1('announcements','publish',(a->>'id')::uuid,a->>'version','{}','Synthetic publish','test-race-publish');end$$;commit;`);
    const idea = (body: string, key: string) =>
      `${claims(member)}select public.submit_challenge_suggestion('question',${quote(body)},'ignored','[]',${quote(key)});`;
    good(
      await overlap(
        idea('What is one kind thing you did today?', 'concurrent-idea-first'),
        idea('What is something new you learned today?', 'concurrent-idea-second'),
      ),
    );
    assert.equal(
      room.sql(
        `select count(*)||':'||sum(delta) from public.spark_ledger where user_id='${member}' and reason='announcement_completion';`,
      ),
      '1:500',
    );
    assert.equal(
      room.sql(
        `select count(*) from public.app_announcement_completions where user_id='${member}';`,
      ),
      '1',
    );
    pass('Two overlapping valid submissions award the campaign bonus once');
    const same = idea('What is something you want to learn tomorrow?', 'concurrent-identical-key');
    good(await overlap(same, same));
    assert.equal(
      room.sql(
        "select count(*) from public.challenge_suggestions where body='What is something you want to learn tomorrow?';",
      ),
      '1',
    );
    pass('Concurrent identical suggestion retries create one idea');

    const business = '92000000-0000-4000-8000-000000000001';
    room.sql(`update business_private.settings set enabled=true,application_terms_version='test',privacy_version='test';
      insert into auth.users(id,email,role,raw_app_meta_data,email_confirmed_at) values('${business}','race-business@test.invalid','doji_business','{"account_type":"business"}',now());`);
    const details = {
      legal_name: 'Synthetic LLC',
      brand_name: 'Synthetic',
      website: 'https://example.test',
      country: 'US',
      business_address: '123 Test Street',
      representative_name: 'Test Owner',
      representative_role: 'Owner',
      category: 'Technology',
      purpose: 'Synthetic test only',
    };
    const key = randomUUID();
    const submit = `${claims(business, 'doji_business')}select public.business_application_command_v1('submit',null,${quote(JSON.stringify(details))},'test','test','${key}');`;
    good(await overlap(submit, submit));
    assert.equal(
      room.sql(
        `select count(*) from business_private.applications where applicant_id='${business}';select count(*) from business_private.submissions;`,
      ),
      '1\n1',
    );
    pass('Concurrent business submission replay creates one application and snapshot');
    return checks;
  } finally {
    for (const child of children) {
      child.stdin?.destroy();
      child.kill();
    }
  }
}
