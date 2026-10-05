// Owns only a randomly named, network-disabled, disposable test container.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { errorOutput, firstRecord, message, record } from './contracts.mts';
import type { DatabaseRun, TestRoom } from './contracts.mts';

import {
  root,
  image,
  authImage,
  storageImage,
  engine,
  verifyLocalEngine,
  verifyOwnedContainer,
} from './config.mts';
const label = 'com.doji.test.clean-room';
export function createCleanRoom() {
  const id = randomUUID();
  const name = `doji-db-test-${id}`;
  let created = false;
  const call = (args: string[], input?: string) =>
    execFileSync(engine, args, {
      encoding: 'utf8',
      input,
      timeout: 120_000,
      maxBuffer: 16 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  const inspect = () => {
    const info = firstRecord(JSON.parse(call(['inspect', name])));
    verifyOwnedContainer(info, name);
    return info;
  };
  const sql = (source: string, database = 'postgres') =>
    call(
      [
        'exec',
        '-i',
        name,
        'psql',
        '-X',
        '-qAt',
        '-U',
        'supabase_admin',
        '-d',
        database,
        '-v',
        'ON_ERROR_STOP=1',
      ],
      source,
    );
  return {
    name,
    call,
    sql,
    inspect,
    async start() {
      verifyLocalEngine();
      // Pulls must be explicit, outside this no-egress test execution.
      call(['image', 'inspect', image]);
      call([
        'run',
        '-d',
        '--pull=never',
        '--network=none',
        '--label',
        `${label}=${id}`,
        '--name',
        name,
        '-e',
        'POSTGRES_PASSWORD=synthetic-local-only',
        image,
        'postgres',
        '-c',
        'shared_preload_libraries=pg_stat_statements,pg_cron,pg_net',
        '-c',
        'cron.database_name=postgres',
        '-c',
        'cron.launch_active_jobs=off',
      ]);
      created = true;
      inspect();
      for (let attempt = 0; attempt < 90; attempt++) {
        try {
          // Readiness requires the final server, not the initdb temporary server.
          if (
            sql("select current_setting('shared_preload_libraries');").includes('pg_cron') &&
            /postgres/.test(call(['exec', name, 'head', '-1', '/proc/1/comm']))
          )
            return;
        } catch {
          /* bounded initialization */
        }
        await new Promise<void>((resolve) => {
          setTimeout(resolve, 500);
        });
      }
      throw Error(`Database did not initialize: ${call(['logs', '--tail=30', name])}`);
    },
    stop() {
      if (!created) return;
      inspect();
      call(['rm', '-f', '-v', name]);
      created = false;
    },
  };
}

export async function replay(room: TestRoom) {
  const files = readdirSync(resolve(root, 'supabase/migrations'))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied = [];
  const statements = [];
  for (const file of files) {
    // Git checkout line endings must not alter PostgreSQL's source-body hashes.
    let source = readFileSync(resolve(root, 'supabase/migrations', file), 'utf8').replaceAll(
      '\r\n',
      '\n',
    );
    // These original migrations were released with CRLF function bodies. Later
    // security preflights pin those exact bodies, including their line endings.
    if (
      [
        '001_initial_schema.sql',
        '002_rls_policies.sql',
        '007_reaction_comment_count_triggers_definer.sql',
        '009_friendships_accepted_at.sql',
        '20260509120000_full_mvp_redesign.sql',
        '20260513160000_community_poll_single_post.sql',
      ].includes(file)
    ) {
      source = source.replaceAll('\n', '\r\n');
    }
    if (file === '20260926030000_employee_enrollment_foundation.sql') {
      const historical: unknown = JSON.parse(
        readFileSync(resolve(root, 'scripts/database/historical-preflight.json'), 'utf8'),
      );
      if (!record(historical) || !Array.isArray(historical.definitions))
        throw Error('Historical preflight definitions must be an array');
      statements.push(
        historical.definitions
          .map((row: unknown) => {
            if (!record(row) || typeof row.definition !== 'string')
              throw Error('Historical preflight definition must be SQL text');
            return row.definition + ';';
          })
          .join('\n'),
      );
      statements.push(
        'revoke all on function public.rls_auto_enable() from public, anon, authenticated;',
      );
    }
    statements.push(`\\echo MIGRATION:${file}\n${source}`);
    applied.push({ file, sha256: createHash('sha256').update(source).digest('hex') });
  }
  try {
    room.sql(`set role postgres;\n${statements.join('\n')}`);
  } catch (error) {
    const file = errorOutput(error, 'stdout')
      .split('\n')
      .reverse()
      .find((line) => line.startsWith('MIGRATION:'));
    const guard = readFileSync(
      resolve(root, 'supabase/migrations/20260926040000_employee_portal_authorization.sql'),
      'utf8',
    );
    const expected = guard.slice(
      guard.indexOf('insert into employee_release_expected values ') +
        'insert into employee_release_expected values '.length,
      guard.indexOf(';', guard.indexOf('insert into employee_release_expected values ')),
    );
    const diagnostics =
      room.sql(`select jsonb_build_object('name',e.signature,'expected',e.fingerprint,'actual',md5(pg_get_functiondef(p.oid)),
      'crlfBody',md5(replace(pg_get_functiondef(p.oid),p.prosrc,replace(replace(p.prosrc,E'\\r\\n',E'\\n'),E'\\n',E'\\r\\n'))))
      from (values ${expected}) e(signature,fingerprint) left join pg_proc p on p.oid=to_regprocedure(e.signature)
      where p.oid is null or md5(pg_get_functiondef(p.oid))<>e.fingerprint;`);
    throw Error(
      `${file || 'Migration replay'} failed:\n${(errorOutput(error, 'stderr') || message(error)).slice(-2500)}\n${diagnostics}`,
    );
  }
  return applied;
}

export function installManagedSchemas(room: TestRoom) {
  room.inspect();
  const run = (image: string, env: Record<string, string>, command: string[]) => {
    room.call(['image', 'inspect', image]);
    // Share only the owned offline loopback namespace. No published ports or internet.
    room.call([
      'run',
      '--rm',
      '--pull=never',
      '--network',
      `container:${room.name}`,
      ...Object.entries(env).flatMap(([k, v]) => ['-e', `${k}=${v}`]),
      image,
      ...command,
    ]);
  };
  room.sql(
    "alter role supabase_auth_admin password 'synthetic-local-only'; alter role supabase_storage_admin password 'synthetic-local-only';",
  );
  run(
    authImage,
    {
      GOTRUE_DB_DRIVER: 'postgres',
      GOTRUE_DB_DATABASE_URL:
        'postgres://supabase_auth_admin:synthetic-local-only@127.0.0.1:5432/postgres?sslmode=disable',
      GOTRUE_SITE_URL: 'http://127.0.0.1',
      API_EXTERNAL_URL: 'http://127.0.0.1',
      GOTRUE_JWT_SECRET: 'synthetic-local-only-not-a-production-secret',
    },
    ['auth', 'migrate'],
  );
  run(
    storageImage,
    {
      DATABASE_URL:
        'postgres://supabase_storage_admin:synthetic-local-only@127.0.0.1:5432/postgres?sslmode=disable',
      AUTH_JWT_SECRET: 'synthetic-local-only-not-a-production-secret',
      STORAGE_BACKEND: 'file',
      FILE_STORAGE_BACKEND_PATH: '/tmp/storage',
    },
    ['node', 'dist/scripts/migrate-call.js'],
  );
  // Replay needs ownership of managed Storage objects in this owned offline
  // cluster. Behavior tests SET ROLE to the restricted API identities instead.
  room.sql('alter role postgres superuser;');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 2, 'No remote targets or connection URLs are accepted');
  const room = createCleanRoom();
  const report: DatabaseRun = { startedAt: new Date().toISOString(), image, status: 'failed' };
  try {
    await room.start();
    report.container = room.name;
    report.images = [image, authImage, storageImage].map((name) => {
      const info = firstRecord(JSON.parse(room.call(['image', 'inspect', name])));
      return { name, id: info.Id, digests: info.RepoDigests };
    });
    console.log('Fresh database ready; network disabled, no published ports.');
    installManagedSchemas(room);
    report.migrations = await replay(room);
    console.log(`PASS: ${report.migrations.length} migrations replayed from empty database.`);
    const { integration } = await import('./integration.mts');
    report.tests = await integration(room);
    const { concurrency } = await import('./concurrency.mts');
    report.concurrency = await concurrency(room, engine);
    report.status = report.tests.failures.length ? 'failed' : 'passed';
    if (report.status === 'failed') process.exitCode = 1;
  } catch (error) {
    report.error = message(error);
    console.error(message(error));
    process.exitCode = 1;
  } finally {
    try {
      room.stop();
    } catch (error) {
      report.status = 'failed';
      report.cleanupError = message(error);
      process.exitCode = 1;
    }
    report.finishedAt = new Date().toISOString();
    const out = resolve(root, 'test-results/database');
    mkdirSync(out, { recursive: true });
    writeFileSync(resolve(out, 'clean-room.json'), JSON.stringify(report, null, 2) + '\n');
  }
}
