// Separate, least-privilege business SQL credential. No provider/member account.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { randomBytes, pbkdf2Sync, createHash, createHmac, X509Certificate } from 'node:crypto';
import { cli, ref, hash } from './prepare-safety-launch.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
import { linkedWorkspace } from './business-disabled-release-reads.mts';
import { fingerprint, windowGuard } from './business-bridge-release-guards.mts';
import { login, roles, guards } from './business-sql-login-guards.mts';
import { createRestrictedSql } from '../infra/portal-identity-candidate/restricted-sql.mts';
import type { RestrictedSqlConfig } from '../infra/portal-identity-candidate/restricted-sql.mts';
import type { SqlParameter } from '../infra/portal-identity-candidate/employee-contracts.mts';
const pg = createRequire(
  new URL('../infra/portal-identity-candidate/package.json', import.meta.url),
)('pg') as typeof import('pg');
const root = 'test-results/business-sql-login-20261005',
  secure = '.artifacts/business-runtime';
const credentialPath = `${secure}/database.json`;
const mode = process.argv[2];
assert.ok(mode && ['prepare', 'rehearse', 'apply', 'verify'].includes(mode));
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const save = (name: string, data: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(data, null, 2), { flag: 'wx' });
const read = async (name: string) =>
  evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const state = () =>
  evidenceRecord(
    query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'fingerprint',(${fingerprint}),'login_exists',exists(select 1 from pg_roles where rolname='${login}'),
 'event_window',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '25 minutes'
 and fires_at+interval '15 minutes'>clock_timestamp() limit 1)) as state;rollback;`)[0]?.state,
  );
assert.equal((await readFile(`${linkedWorkspace}/supabase/.temp/project-ref`, 'utf8')).trim(), ref);
assert.ok(
  (await readdir('test-results/business-independent-bridge-20261005')).some((f) =>
    f.startsWith('verified-'),
  ),
);
await mkdir(root, { recursive: true });
if (mode === 'prepare') {
  const before = state();
  assert.equal(before.login_exists, false);
  assert.equal(before.event_window, false);
  await mkdir(secure, { recursive: true });
  execFileSync('git', ['check-ignore', credentialPath], { stdio: 'pipe' });
  const owner = execFileSync('whoami', [], { encoding: 'utf8' }).trim();
  execFileSync(
    'icacls',
    [secure, '/inheritance:r', '/grant:r', `${owner}:(OI)(CI)F`, 'SYSTEM:(OI)(CI)F'],
    { stdio: 'pipe' },
  );
  const pooler = new URL(
    (await readFile(`${linkedWorkspace}/supabase/.temp/pooler-url`, 'utf8')).trim(),
  );
  assert.equal(pooler.hostname, 'aws-1-us-west-2.pooler.supabase.com');
  const caSource =
    'https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt';
  const response = await fetch(caSource, { redirect: 'error', signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200);
  const ca = await response.text();
  assert.ok(ca.length < 16000);
  const cert = new X509Certificate(ca);
  assert.equal(cert.ca, true);
  assert.equal(cert.checkIssued(cert), true);
  assert.equal(cert.verify(cert.publicKey), true);
  assert.match(cert.subject, /Supabase Root 2021 CA/);
  assert.ok(Date.parse(cert.validFrom) < Date.now() && Date.parse(cert.validTo) > Date.now());
  const config: RestrictedSqlConfig = {
    realm: 'business',
    host: pooler.hostname,
    projectRef: ref,
    port: 6543,
    database: 'postgres',
    username: `${login}.${ref}`,
    password: randomBytes(48).toString('base64url'),
    ca,
  };
  await writeFile(credentialPath, JSON.stringify(config), { flag: 'wx' });
  const salt = randomBytes(16),
    salted = pbkdf2Sync(config.password, salt, 4096, 32, 'sha256');
  const stored = createHash('sha256')
    .update(createHmac('sha256', salted).update('Client Key').digest())
    .digest('base64');
  const server = createHmac('sha256', salted).update('Server Key').digest('base64');
  const verifier = `SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`;
  const sql = `begin;set local lock_timeout='2s';set local statement_timeout='8s';
 do $$begin if not pg_try_advisory_xact_lock(hashtextextended('doji-business-sql-login-v1',0)) then raise exception 'Concurrent release';end if;
 if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Contract drift';end if;${windowGuard}end$$;
 create role ${login} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 2 password '${verifier}';
 grant connect on database postgres to ${login};
 grant ${roles.join(',')} to ${login} with inherit false,set true;
 alter role ${login} set statement_timeout='3s';alter role ${login} set lock_timeout='1s';
 alter role ${login} set idle_in_transaction_session_timeout='4s';
 ${guards}
 do $$begin if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Existing contract changed';end if;end$$;
 commit;`;
  await writeFile(`${secure}/install.sql`, sql, { flag: 'wx' });
  await writeFile(`${secure}/rehearse.sql`, sql.replace(/commit;$/, 'rollback;'), { flag: 'wx' });
  await writeFile(
    `${root}/rollback.sql`,
    `begin;set local lock_timeout='2s';set local statement_timeout='5s';
 alter role ${login} nologin;revoke ${roles.join(',')} from ${login};commit;`,
    { flag: 'wx' },
  );
  await save('candidate', {
    at: new Date().toISOString(),
    before,
    sqlHash: hash(sql),
    configHash: hash(JSON.stringify(config)),
    role: login,
    roles,
    connectionLimit: 2,
    ca: { source: caSource, fingerprint: cert.fingerprint256, validTo: cert.validTo },
    disabled: true,
  });
  console.log(
    'Prepared protected business SQL credential and exact rollback. No live role created.',
  );
} else {
  const candidate = await read('candidate'),
    sql = await readFile(`${secure}/install.sql`, 'utf8');
  assert.equal(hash(sql), candidate.sqlHash);
  assert.equal(hash(await readFile(credentialPath)), candidate.configHash);
  if (mode === 'rehearse' || mode === 'apply') {
    assert.deepEqual(state(), candidate.before);
    if (mode === 'apply') {
      assert.equal((await read('rehearsed')).sqlHash, candidate.sqlHash);
      await save('apply-started', { at: new Date().toISOString() });
    }
    cli([
      'db',
      'query',
      '--file',
      resolve(`${secure}/${mode === 'apply' ? 'install' : 'rehearse'}.sql`),
      '--linked',
      '--workdir',
      linkedWorkspace,
      '--output-format',
      'json',
    ]);
    if (mode === 'rehearse') {
      assert.deepEqual(state(), candidate.before);
      await save('rehearsed', { at: new Date().toISOString(), sqlHash: candidate.sqlHash });
      console.log(
        'Restricted business role/grant rehearsal rolled back; existing contracts unchanged.',
      );
      process.exit(0);
    }
  }
  const after = state();
  assert.equal(after.login_exists, true);
  assert.equal(after.fingerprint, evidenceRecord(candidate.before).fingerprint);
  query(`begin read only;set local statement_timeout='5s';${guards}rollback;`);
  const config: RestrictedSqlConfig = JSON.parse(await readFile(credentialPath, 'utf8'));
  const execute = createRestrictedSql(config, (o) => new pg.Client(o));
  const calls: [string, string, SqlParameter[], unknown][] = [
    [
      roles[0],
      'select business_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result',
      ['a'.repeat(64), 'peek', 'flow', 'b'.repeat(64), null, null, null, null],
      '42501',
    ],
    [
      roles[1],
      'select business_session_private.reserve_registration($1,$2,$3) as result',
      ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)],
      false,
    ],
    [
      roles[2],
      'select portal_identity_private.complete_business_enrollment($1,$2,$3,$4,$5,$6,$7,$8,$9) as result',
      [
        'https://invalid.test',
        'client_invalid',
        'user_probe',
        'session_probe',
        true,
        true,
        'terms-v1',
        'privacy-v1',
        'US',
      ],
      '42501',
    ],
    [
      roles[3],
      'select portal_identity_private.read_business_application($1,$2,$3,$4,$5) as result',
      ['https://invalid.test', 'client_invalid', 'user_probe', 'session_probe', false],
      '42501',
    ],
  ];
  const checks = [];
  for (const [role, statement, params, expected] of calls) {
    let actual: unknown;
    try {
      actual = await execute(role, statement, params, AbortSignal.timeout(6000));
    } catch (error) {
      actual = error instanceof Error && 'code' in error ? error.code : undefined;
    }
    assert.equal(actual, expected, `Exact disabled database gate: ${role}`);
    checks.push({ role, disabled: true });
  }
  await save(`verified-${Date.now()}`, {
    at: new Date().toISOString(),
    after,
    checks,
    tlsVerified: true,
    cutover: false,
  });
  console.log(
    'Business SQL TLS and four restricted roles verified at disabled gates; member/employee contracts unchanged.',
  );
}
