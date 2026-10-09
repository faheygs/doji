import assert from 'node:assert/strict';
import { execFile, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { engine } from './config.mts';
import type { TestRoom } from './contracts.mts';
import { quote } from './integration.mts';

/** Two real connections, with the second verified waiting on a database lock. */
export async function announcementComposeConcurrency(room: TestRoom) {
  const actor = '92000000-0000-4000-8000-000000000099';
  room.sql(`insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data)
    values('${actor}','authenticated','doji_employee','compose-race@test.invalid','{"account_type":"employee"}','{}');
    insert into public.admin_employees(id,display_name,status,roles)
    values('${actor}','Synthetic race employee','active',array['super_admin']);
    update public.admin_employee_cutover set employee_only=true;`);
  const children = new Set<ChildProcess>();
  const begin = `begin;set local statement_timeout='12s';set local lock_timeout='10s';
    set local request.jwt.claims='${JSON.stringify({ sub: actor, role: 'doji_employee', aal: 'aal2' })}';
    set local role doji_employee;`;
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
      errors = '';
    let markReady: () => void = () => {};
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
    child.stdin.write(begin + sql + '\n');
    if (hold) child.stdin.write('\\echo LOCK_HELD\n');
    else child.stdin.end('commit;\n');
    return { child, ready, done };
  }
  async function overlap(left: string, right: string) {
    const a = start(left, true);
    const timeout = setTimeout(() => a.child.kill(), 15000);
    try {
      await Promise.race([
        a.ready,
        a.done.then((r) => {
          throw Error(r.errors || 'No lock acquired');
        }),
      ]);
      const b = start("set local application_name='doji_compose_contender';" + right, false);
      let waiting = false;
      for (let n = 0; n < 40; n++) {
        waiting =
          room.sql(
            "select exists(select 1 from pg_stat_activity where application_name='doji_compose_contender' and wait_event_type='Lock');",
          ) === 't';
        if (waiting) break;
        await delay(50);
      }
      assert.ok(waiting, 'Second transaction must actually contend on a lock');
      a.child.stdin?.end('commit;\n');
      return await Promise.all([a.done, b.done]);
    } finally {
      clearTimeout(timeout);
    }
  }
  const payload = {
    title: 'Concurrent synthetic announcement',
    body: 'Offline only',
    ends_at: new Date(Date.now() + 3600000).toISOString(),
    priority: 0,
    max_impressions_per_user: 1,
    min_hours_between_impressions: 24,
  };
  const command = (request: string) =>
    `select public.admin_announcement_compose_v1('publish',null,null,${quote(JSON.stringify(payload))},'${request}');`;
  try {
    const same = '92000000-0000-4000-8000-000000000090';
    const results = await overlap(command(same), command(same));
    for (const r of results) assert.equal(r.code, 0, r.errors);
    assert.ok(results[1]?.output.includes('"replayed": true'));
    assert.equal(
      room.sql(
        'select count(*) from public.app_announcements;select count(*) from public.admin_audit_log;',
      ),
      '1\n2',
    );
    console.log(
      'PASS: concurrent identical requests publish exactly once with one audited create/publish pair',
    );
    // Competing draft edits serialize on the same row; the loser must fail CAS.
    const draftInput = {
      ...payload,
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at: new Date(Date.now() + 172800000).toISOString(),
    };
    const draft = JSON.parse(
      room.sql(
        begin +
          `select public.admin_announcement_compose_v1('save_draft',null,null,${quote(JSON.stringify(draftInput))},gen_random_uuid());commit;`,
      ),
    );
    const edit = (title: string) =>
      `select public.admin_announcement_compose_v1('save_draft','${draft.item.id}','${draft.item.version}',${quote(JSON.stringify({ ...draftInput, title }))},gen_random_uuid());`;
    const edits = await overlap(edit('First edit'), edit('Stale competing edit'));
    assert.equal(edits[0]?.code, 0, edits[0]?.errors);
    assert.notEqual(edits[1]?.code, 0);
    assert.match(edits[1]?.errors ?? '', /Item changed/);
    assert.equal(
      room.sql(`select title from public.app_announcements where id='${draft.item.id}';`),
      'First edit',
    );
    console.log(
      'PASS: simultaneous draft edits reject the stale write without losing the committed edit',
    );
  } finally {
    for (const child of children) child.kill();
  }
}
