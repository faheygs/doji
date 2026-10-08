import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { TestRoom } from './contracts.mts';

// Require a proven lock wait, not a timing-based guess that two calls overlapped.
export async function staffWorkflowOverlap(
  room: TestRoom,
  engine: string,
  first: string,
  second: string,
  mode: 'wait' | 'independent' = 'wait',
) {
  room.inspect();
  const start = (source: string, hold: boolean) => {
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
    assert.ok(child.stdin && child.stdout && child.stderr);
    const stdin = child.stdin;
    let out = '',
      err = '';
    let readyResolve: (() => void) | undefined;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    child.stdout.on('data', (chunk) => {
      out += chunk;
      if (out.includes('STAFF_LOCK_HELD')) readyResolve?.();
    });
    child.stderr.on('data', (chunk) => {
      err += chunk;
    });
    const done = new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
      child.on('error', (error) => resolve({ code: -1, out, err: error.message }));
      child.on('close', (code) => resolve({ code, out, err }));
    });
    stdin.write(`begin;set local statement_timeout='10s';set local lock_timeout='8s';${source}\n`);
    if (hold) stdin.write('\\echo STAFF_LOCK_HELD\n');
    else stdin.end('commit;');
    return { stdin, ready, done };
  };
  const a = start(first, true);
  let b: ReturnType<typeof start> | undefined;
  try {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        a.ready,
        a.done.then((result) => {
          throw Error(result.err || 'First transaction exited before barrier');
        }),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(Error('Staff lock setup timeout')), 10000);
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    const tag = `staff_race_${randomUUID().replaceAll('-', '')}`;
    b = start(`set local application_name='${tag}';${second}`, false);
    if (mode === 'independent') {
      // The first transaction remains open at the proven barrier until the
      // complete second transaction succeeds. A lock timeout fails the check.
      const right = await b.done;
      assert.equal(right.code, 0, right.err);
      a.stdin.end('commit;');
      const left = await a.done;
      assert.equal(left.code, 0, left.err);
      return right;
    }
    let waiting = false;
    for (let attempt = 0; attempt < 25; attempt++) {
      waiting =
        room.sql(
          `select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock');`,
        ) === 't';
      if (waiting) break;
      await delay(40);
    }
    assert.ok(waiting, 'Competing staff transaction must actually wait on a database lock');
    a.stdin.end('commit;');
    const left = await a.done;
    assert.equal(left.code, 0, left.err);
    return await b.done;
  } finally {
    if (!a.stdin.destroyed && !a.stdin.writableEnded) a.stdin.end('rollback;');
    await a.done;
    if (b) await b.done;
  }
}
