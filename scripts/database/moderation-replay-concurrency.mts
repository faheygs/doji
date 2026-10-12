import assert from 'node:assert/strict';
import { execFile, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { engine } from './config.mts';
import type { TestRoom } from './contracts.mts';

export async function moderationReplayConcurrency(room: TestRoom, setup: string) {
  room.inspect();
  room.sql(
    setup +
      `update public.reports set reported_user_id=current_setting('test.member_id')::uuid;commit;`,
  );
  const claims = `set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000003","role":"doji_employee","aal":"aal2"}';set local role doji_employee;`;
  const children = new Set<ChildProcess>();
  function start(sql: string, hold: boolean) {
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
      { timeout: 20000 },
    );
    children.add(child);
    assert.ok(child.stdin && child.stdout && child.stderr);
    let output = '',
      errors = '',
      markReady: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      markReady = resolve;
    });
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.includes('LOCK_HELD')) markReady();
    });
    child.stderr.on('data', (chunk) => {
      errors += chunk;
    });
    const done = new Promise<{ code: number | null; output: string; errors: string }>(
      (resolve, reject) => {
        child.on('error', reject);
        child.on('close', (code) => {
          children.delete(child);
          resolve({ code, output, errors });
        });
      },
    );
    child.stdin.write(
      `begin;set local statement_timeout='12s';set local lock_timeout='10s';${claims}${sql}\n`,
    );
    if (hold) child.stdin.write('\\echo LOCK_HELD\n');
    else child.stdin.end('commit;\n');
    return { child, ready, done };
  }
  async function overlap(left: string, right: string, expectedError?: string) {
    const tag = 'moderation_replay_' + randomUUID().replaceAll('-', '');
    const a = start(left, true);
    const timeout = setTimeout(() => a.child.kill(), 15000);
    try {
      await Promise.race([
        a.ready,
        a.done.then((r) => {
          throw Error(r.errors || 'No held transaction');
        }),
      ]);
      const b = start(`set local application_name='${tag}';${right}`, false);
      let waiting = false;
      for (let n = 0; n < 40; n++) {
        waiting =
          room.sql(
            `select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock');`,
          ) === 't';
        if (waiting) break;
        await delay(50);
      }
      assert.ok(waiting, 'Second connection must wait on a real lock');
      a.child.stdin?.end('commit;\n');
      const [first, second] = await Promise.all([a.done, b.done]);
      assert.equal(first.code, 0, first.errors);
      if (expectedError) {
        assert.notEqual(second.code, 0);
        assert.ok(second.errors.includes(expectedError), second.errors);
      } else {
        assert.equal(second.code, 0, second.errors);
        const receipt = (out: string) =>
          JSON.parse(out.split('\n').find((l) => l.startsWith('{'))!);
        assert.deepEqual(
          receipt(first.output),
          receipt(second.output),
          'Concurrent receipts must match exactly',
        );
      }
    } finally {
      clearTimeout(timeout);
      if (!a.child.stdin?.writableEnded) a.child.stdin?.end('rollback;\n');
    }
  }
  const decision = `select public.admin_decide_report_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove_content','violence_threats','level_3',
    'Concurrent restriction rationale','Concurrent member notice','temporary_restriction',7,'concurrent-moderation-key-0001');`;
  try {
    await overlap(decision, decision);
    assert.equal(
      room.sql(
        "select count(*) from public.moderation_decisions where report_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';",
      ),
      '1',
    );
    const before = room.sql(
      'select row_to_json(a)::text from public.moderation_account_actions a;',
    );
    await overlap(
      decision,
      decision.replace('Concurrent restriction rationale', 'Different concurrent rationale'),
      'Idempotency key already used',
    );
    assert.equal(
      room.sql('select row_to_json(a)::text from public.moderation_account_actions a;'),
      before,
    );
    const decisionId = room.sql(
      "select id from public.moderation_decisions where report_id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';",
    );
    room.sql(`begin;set local request.jwt.claims='{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1"}';
      set local role authenticated;select public.submit_moderation_appeal('${decisionId}',
      'Concurrent synthetic member appeal','concurrent-member-appeal-0001');commit;`);
    const appealId = room.sql(
      `select id from public.moderation_appeals where decision_id='${decisionId}';`,
    );
    const appeal = `select public.admin_review_moderation_appeal('${appealId}','reverse','Concurrent appeal review rationale','concurrent-appeal-key-0001');`;
    await overlap(appeal, appeal);
    assert.equal(
      room.sql("select count(*) from public.moderation_notices where kind='appeal_reversed';"),
      '1',
    );
    return [
      'Real overlapping decision and appeal retries return identical receipts; conflicting key reuse rejected without expiry change',
    ];
  } finally {
    for (const child of children) {
      child.stdin?.destroy();
      child.kill();
    }
  }
}
