// No URL/host/credential overrides: only the existing network-none synthetic container.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { loadState, functionHashes, jsonRecord } from './contracts.mts';
import type { BenchmarkRun } from './contracts.mts';
import { offlineContainer, message, record } from '../database/contracts.mts';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
const container = 'supabase_db_employee-cutover-verify';
const root = resolve('test-results/local-query-repair-20260928');
const stateFile = `${root}/state.json`;
const mode = process.argv[2] ?? '';
assert.ok(
  ['prepare', 'finalize', 'ramp', 'soak', 'app-shape', 'recovery', 'inspect', 'cleanup'].includes(
    mode,
  ),
);
const exec = (args: string[], options: { input?: string; timeout?: number } = {}) =>
  execFileSync(podman, args, { encoding: 'utf8', maxBuffer: 12e6, timeout: 60000, ...options });
const info = offlineContainer(JSON.parse(exec(['inspect', container])));
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
assert.ok(record(info.State));
assert.equal(info.State.Running, true);
const read = (p: string) => readFileSync(p, 'utf8');
const save = (name: string, data: unknown) =>
  writeFileSync(`${root}/${name}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
const sql = (db: string, input: string, timeout = 60000) =>
  exec(
    [
      'exec',
      '-i',
      container,
      'psql',
      '-X',
      '-h',
      '/var/run/postgresql',
      '-U',
      'postgres',
      '-d',
      db,
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { input, timeout },
  ).trim();
const snapshot = (db: string) =>
  jsonRecord(
    sql(
      db,
      `select json_build_object('database',current_database(),'at',clock_timestamp(),'database_bytes',pg_database_size(current_database()),'settings',(select json_object_agg(name,setting) from pg_settings where name in ('shared_buffers','work_mem','max_connections','fsync','synchronous_commit')),'counts',json_build_object('profiles',(select count(*) from public.profiles),'posts',(select count(*) from public.posts),'friendships',(select count(*) from public.friendships),'comments',(select count(*) from public.comments),'reactions',(select count(*) from public.reactions),'outbox',(select count(*) from public.domain_event_outbox)),'replication_role',current_setting('session_replication_role'));`,
    ),
  );
mkdirSync(root, { recursive: true });
let state;
if (mode === 'prepare') {
  if (readdirSync(root).includes('state.json')) {
    const prior = loadState(read(stateFile));
    const cleaned = jsonRecord(read(`${root}/cleanup.json`));
    assert.equal(cleaned.database, prior.db);
    assert.equal(cleaned.dropped, true);
  }
  assert.equal(
    sql(
      'postgres',
      "select count(*) from auth.users where email is null or email not like '%@test.invalid'; select count(*) from vault.secrets;",
    ),
    '0\n0',
  );
  const db = `heavy_load_qa_${Date.now()}`;
  state = {
    db,
    createdAt: new Date().toISOString(),
    container,
    network: 'none',
    productionTraffic: false,
  };
  assert.match(db, /^heavy_load_qa_[0-9]+$/);
  sql('postgres', `create database ${db} template postgres;`);
  save('state.json', state);
  for (const f of [
    '20260926050000_skip_unchanged_push_profile_update.sql',
    '20260927020000_employee_case_evidence.sql',
    '20260927030000_employee_editorial_workflows.sql',
    '20260927040000_announcement_campaigns.sql',
    '20260927050000_community_idea_retriage.sql',
    '20260928020000_repair_suggestion_profile_policy.sql',
  ]) {
    sql(db, read(`supabase/migrations/${f}`));
  }
  const hashes = functionHashes(
    JSON.parse(
      sql(
        db,
        "select json_object_agg(p.oid::regprocedure::text,json_build_object('hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';",
      ),
    ),
  );
  const baseline = functionHashes(
    jsonRecord(read('test-results/performance-repair-20260928/database-after.json')).functions,
  );
  const drift = Object.entries(baseline)
    .filter(([name, x]) => hashes[name]?.hash !== x.hash || hashes[name]?.acl !== x.acl)
    .map(([name]) => name);
  save('function-comparison.json', { compared: Object.keys(baseline).length, drift });
  assert.deepEqual(drift, [], 'Local functions must match captured released baseline');
  console.log('Seeding 100,000 synthetic accounts in isolated clone', db);
  sql(db, read('scripts/load/local-heavy-fixture.sql'), 600000);
  save('seeded.json', snapshot(db));
  console.log('Fixture seeded; inspect rollups before running benchmarks.');
  exit();
}
function exit() {
  process.exit(0);
}
state = loadState(read(stateFile));
const db = state.db;
assert.match(db, /^heavy_load_qa_[0-9]+$/);
assert.equal(state.container, container);
assert.equal(
  sql(
    db,
    "select count(*) from auth.users where email is null or email not like '%@test.invalid';select count(*) from vault.secrets;",
  ),
  '0\n0',
);
if (mode === 'cleanup') {
  sql('postgres', `drop database ${db};`);
  save('cleanup.json', { at: new Date().toISOString(), database: db, dropped: true });
  console.log('Only disposable synthetic database removed.');
  exit();
}
if (mode === 'inspect') {
  console.log(JSON.stringify(snapshot(db)));
  exit();
}
if (mode === 'finalize') {
  sql(db, read('scripts/load/local-heavy-validate-fixture.sql'), 150000);
  sql(db, read('scripts/load/local-heavy-rollups.sql'), 360000);
  save('ready.json', snapshot(db));
  console.log('Full synthetic fixture/rollups verified and analyzed; runtime triggers enabled.');
  exit();
}
const ready = jsonRecord(read(`${root}/ready.json`));
assert.equal(ready.database, db, 'Finalize this exact fixture before testing');
assert.ok(record(ready.counts));
assert.equal(ready.counts.profiles, 100000, 'Finalize the fixture before testing');
const phaseResults: BenchmarkRun[] = [];
const base = `\\set uid random(1,100000)\n\\set post random(1,100000)\nbegin;\nset local statement_timeout='8s';\nselect set_config('request.jwt.claims',json_build_object('sub',local_load.id(:uid),'role','authenticated','aal','aal1')::text,true);\nset local role authenticated;\n`;
const operations = {
  profile: 'select public.get_own_profile();',
  feed: "select public.get_feed_page_snapshot_v2(local_load.id(1,'a3'),'everyone',20,null,null);",
  friends: "select public.get_feed_page_snapshot_v2(local_load.id(1,'a3'),'friends',20,null,null);",
  comments:
    "select public.get_comment_thread_snapshot(local_load.id(:post,'a6'),'everyone',null,null,20);",
  notifications:
    mode === 'app-shape'
      ? "select public.get_notification_center_snapshot(now()-interval '30 days',200);"
      : "select public.get_notification_center_snapshot(now()-interval '2 days',20);",
  realtime: "select public.get_realtime_token_capabilities(array[local_load.id(:post,'a6')]);",
  reaction:
    "select public.set_post_reaction(local_load.id(:post,'a6'),'fire',true,gen_random_uuid()::text);",
  hot_reaction:
    "select public.set_post_reaction(local_load.id(100000,'a6'),'fire',true,gen_random_uuid()::text);",
  comment_write:
    "select public.submit_comment(local_load.id(:post,'a6'),'Synthetic load comment',null,gen_random_uuid()::text);",
};
const dir = `/tmp/${db}`;
exec(['exec', container, 'mkdir', '-p', dir]);
for (const [name, body] of Object.entries(operations)) {
  save(`${name}.sql`, base + body + '\ncommit;\n');
  exec(['cp', `${root}/${name}.sql`, `${container}:${dir}/${name}.sql`]);
}
async function bench(
  label: string,
  {
    clients,
    seconds,
    rate,
    weights,
  }: { clients: number; seconds: number; rate?: number; weights: Record<string, number> },
): Promise<BenchmarkRun> {
  label = `validated-${label}`;
  const prefix = `${dir}/${label}`;
  const args = [
    'exec',
    '-e',
    `PGAPPNAME=local-heavy-${label}`,
    container,
    'pgbench',
    '-h',
    '/var/run/postgresql',
    '-U',
    'postgres',
    '-n',
    '-c',
    String(clients),
    '-j',
    '4',
    '-T',
    String(seconds),
    '-P',
    '30',
    '-r',
    '-l',
    `--log-prefix=${prefix}`,
    '--random-seed=20260928',
  ];
  if (rate) args.push('-R', String(rate), '-L', '2000');
  for (const [name, weight] of Object.entries(weights))
    args.push('-f', `${dir}/${name}.sql@${weight}`);
  args.push(db);
  const started = Date.now();
  let output = '';
  console.log(JSON.stringify({ starting: label, clients, seconds, rate, weights }));
  const child = spawn(podman, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let stoppedOnError = false;
  const stopConnections = () =>
    sql(
      db,
      `select pg_terminate_backend(pid) from pg_stat_activity where datname=current_database() and application_name='local-heavy-${label}' and pid<>pg_backend_pid();`,
      10000,
    );
  child.stdout.on('data', (b) => {
    output += b;
  });
  child.stderr.on('data', (b) => {
    const text = b.toString();
    output += text;
    for (const line of text.split('\n')) if (line.startsWith('progress:')) console.log(line);
    if (/error:/.test(text) && !stoppedOnError) {
      stoppedOnError = true;
      console.log('Stopping this phase on a real SQL/client failure; results are incomplete.');
      stopConnections();
    }
  });
  const samples: Record<string, unknown>[] = [];
  const sampleTimer = setInterval(() => {
    try {
      samples.push(
        jsonRecord(
          sql(
            db,
            `select json_build_object('at',clock_timestamp(),'active',(select count(*) from pg_stat_activity where datname=current_database() and state='active'),'blocked',(select count(*) from pg_stat_activity where datname=current_database() and cardinality(pg_blocking_pids(pid))>0),'temp_bytes',temp_bytes,'deadlocks',deadlocks,'xact_commit',xact_commit,'xact_rollback',xact_rollback) from pg_stat_database where datname=current_database();`,
            10000,
          ),
        ),
      );
      save(`${label}-samples.json`, samples);
    } catch (error) {
      samples.push({ at: new Date().toISOString(), samplingError: message(error).slice(0, 200) });
    }
  }, 30000);
  const timer = setTimeout(
    () => {
      stopConnections();
      child.kill();
    },
    (seconds + 60) * 1000,
  );
  const code = await new Promise<number | null>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  clearTimeout(timer);
  clearInterval(sampleTimer);
  save(`${label}.txt`, output);
  // pgbench emits one local log per worker. Copy only this phase's known logs.
  mkdirSync(`${root}/logs-${label}`, { recursive: true });
  const logPaths = exec([
    'exec',
    container,
    'find',
    dir,
    '-maxdepth',
    '1',
    '-type',
    'f',
    '-name',
    `${label}.*`,
  ])
    .trim()
    .split('\n')
    .filter(Boolean);
  for (const p of logPaths) {
    assert.ok(p.startsWith(`${dir}/${label}.`));
    exec(['cp', `${container}:${p}`, `${root}/logs-${label}`]);
  }
  const files = readdirSync(`${root}/logs-${label}`).filter((n) => n.startsWith(label + '.'));
  const timings: number[] = [],
    byScript: Record<string, number[]> = {};
  let skipped = 0,
    failed = 0;
  for (const name of files)
    for (const line of read(`${root}/logs-${label}/${name}`).trim().split('\n')) {
      const fields = line.trim().split(/\s+/);
      if (fields.length < 6 || fields[2] === undefined || fields[3] === undefined) continue;
      if (fields[2] === 'skipped') {
        skipped++;
        continue;
      }
      if (fields[2].startsWith('failed')) {
        failed++;
        continue;
      }
      const ms = Number(fields[2]) / 1000;
      if (!Number.isFinite(ms)) continue;
      timings.push(ms);
      (byScript[fields[3]] ??= []).push(ms);
    }
  const stats = (a: number[]) => {
    a.sort((x, y) => x - y);
    return {
      count: a.length,
      p50: a[Math.max(0, Math.ceil(a.length * 0.5) - 1)] ?? null,
      p95: a[Math.max(0, Math.ceil(a.length * 0.95) - 1)] ?? null,
      p99: a[Math.max(0, Math.ceil(a.length * 0.99) - 1)] ?? null,
      max: a.at(-1) ?? null,
    };
  };
  const result = {
    label,
    clients,
    seconds,
    rate: rate ?? null,
    weights,
    exitCode: code,
    aborted: code !== 0 || /aborted|error:/i.test(output),
    sqlTimeouts: (output.match(/canceling statement due to statement timeout/g) || []).length,
    wallMs: Date.now() - started,
    completed: stats(timings),
    skipped,
    failed,
    perScript: Object.fromEntries(
      Object.entries(byScript).map(([key, a]) => [Object.keys(weights)[Number(key)], stats(a)]),
    ),
  };
  phaseResults.push(result);
  save(`${label}.json`, result);
  console.log(JSON.stringify(result));
  return result;
}
if (mode === 'ramp') {
  for (const name of [
    'profile',
    'feed',
    'friends',
    'comments',
    'notifications',
    'realtime',
    'reaction',
    'comment_write',
  ])
    await bench(`single-${name}`, { clients: 1, seconds: 10, weights: { [name]: 1 } });
  for (const clients of [8, 16, 32, 64])
    await bench(`ramp-${clients}`, {
      clients,
      seconds: 30,
      weights: {
        profile: 15,
        feed: 25,
        friends: 15,
        comments: 15,
        notifications: 10,
        realtime: 10,
        reaction: 7,
        comment_write: 3,
      },
    });
} else if (mode === 'soak') {
  // Two explicit offered loads: normal activity and a heavy twenty-minute burst.
  await bench('normal-5m', {
    clients: 8,
    seconds: 300,
    rate: 20,
    weights: {
      profile: 20,
      feed: 20,
      friends: 15,
      comments: 20,
      notifications: 10,
      realtime: 5,
      reaction: 7,
      comment_write: 3,
    },
  });
  await bench('launch-heavy-20m', {
    clients: 64,
    seconds: 1200,
    rate: 1000,
    weights: {
      profile: 10,
      feed: 25,
      friends: 15,
      comments: 10,
      notifications: 10,
      realtime: 15,
      reaction: 8,
      hot_reaction: 4,
      comment_write: 3,
    },
  });
} else if (mode === 'app-shape') {
  await bench('app-shape-heavy-60s', {
    clients: 64,
    seconds: 60,
    rate: 1000,
    weights: {
      profile: 10,
      feed: 25,
      friends: 15,
      comments: 10,
      notifications: 10,
      realtime: 15,
      reaction: 8,
      hot_reaction: 4,
      comment_write: 3,
    },
  });
} else
  await bench('recovery-60s', {
    clients: 4,
    seconds: 60,
    rate: 10,
    weights: { profile: 20, feed: 30, friends: 20, comments: 20, notifications: 10 },
  });
save(`${mode}-after.json`, snapshot(db));
const gate = {
  passed: phaseResults.every(
    (r) =>
      !r.aborted &&
      r.skipped === 0 &&
      r.failed === 0 &&
      r.completed.count > 0 &&
      r.completed.p95 !== null &&
      r.completed.p95 <= 2000,
  ),
  criteria:
    'No aborts, skipped arrivals or failed transactions; completed p95 <= 2000ms. Local test only.',
  phases: phaseResults.map((r) => r.label),
};
save(`${mode}-gate.json`, gate);
if (!gate.passed) process.exitCode = 1;
