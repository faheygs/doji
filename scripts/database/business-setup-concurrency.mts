import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { engine } from './config.mts';
import type { createCleanRoom } from './clean-room.mts';
// Runs only inside the already-verified, owned, network-disabled clean room.
export async function setupConcurrency(room: ReturnType<typeof createCleanRoom>) {
  room.inspect();
  const args = [
    'exec',
    '-i',
    room.name,
    'psql',
    '-X',
    '-qAt',
    '-U',
    'supabase_admin',
    '-d',
    'postgres',
    '-v',
    'ON_ERROR_STOP=1',
  ];
  const prefix =
    "begin;set local role postgres;set local lock_timeout='4s';set local statement_timeout='8s';";
  const details =
    '{"description":"Concurrent brand","website":"https://example.com","primary_color":"#123456","secondary_color":"#ABCDEF","logo":""}';
  const save = (revision: number, id: number) =>
    `select portal_identity_private.business_setup_v1('https://issuer.test/','business','user_owner','concurrency',true,'save',${revision},'${details}','89000000-0000-4000-8000-${String(id).padStart(12, '0')}');`;
  async function overlap(first: string, second: string) {
    const child = execFile(engine, args, { encoding: 'utf8' });
    let out = '',
      err = '';
    let ready!: () => void;
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    child.stdout!.on('data', (chunk) => {
      out += chunk;
      if (out.includes('setup_lock_held')) ready();
    });
    child.stderr!.on('data', (chunk) => {
      err += chunk;
    });
    const done = new Promise<void>((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => (code === 0 ? resolve() : reject(Error(err))));
    });
    child.stdin!.end(prefix + first + '\n\\echo setup_lock_held\nselect pg_sleep(0.5);commit;');
    await Promise.race([
      locked,
      done.then(() => {
        throw Error('Missing overlap marker');
      }),
    ]);
    const other = new Promise<{ error: unknown; stdout: string; stderr: string }>((resolve) => {
      const process = execFile(engine, args, { encoding: 'utf8' }, (error, stdout, stderr) =>
        resolve({ error, stdout, stderr }),
      );
      process.stdin!.end(prefix + second + 'commit;');
    });
    await done;
    return { first: out, second: await other };
  }
  const identical = await overlap(save(2, 1), save(2, 1));
  assert.equal(identical.second.error, null, identical.second.stderr);
  assert.match(identical.first, /"replayed": false/);
  assert.match(identical.second.stdout, /"replayed": true/);
  assert.equal(room.sql('select revision from business_private.brand_profiles'), '3');
  console.log('PASS: simultaneous same-key saves commit once and replay once');
  const conflict = await overlap(save(3, 2), save(3, 3));
  assert.ok(conflict.second.error);
  assert.match(conflict.second.stderr, /Business setup changed/);
  assert.equal(room.sql('select revision from business_private.brand_profiles'), '4');
  console.log('PASS: simultaneous different-key saves cannot overwrite one revision');
  const denied = await overlap(
    "update business_private.accounts set disabled=true where id='82000000-0000-4000-8000-000000000001';",
    save(4, 4),
  );
  assert.ok(denied.second.error);
  assert.match(denied.second.stderr, /Business access disabled/);
  assert.equal(room.sql('select revision from business_private.brand_profiles'), '4');
  room.sql(
    "set role postgres;update business_private.accounts set disabled=false where id='82000000-0000-4000-8000-000000000001';",
  );
  console.log('PASS: concurrent account disable wins before a waiting setup write');
  const reopened = await overlap(
    "select 1 from business_private.accounts where id='82000000-0000-4000-8000-000000000001' for update;update business_private.applications set state='changes_requested' where id='83000000-0000-4000-8000-000000000001';",
    save(4, 5),
  );
  assert.ok(reopened.second.error);
  assert.match(reopened.second.stderr, /Approval required/);
  assert.equal(room.sql('select revision from business_private.brand_profiles'), '4');
  room.sql(
    "set role postgres;update business_private.applications set state='approved' where id='83000000-0000-4000-8000-000000000001';",
  );
  console.log('PASS: concurrent approval reopen denies a waiting setup write');
}
