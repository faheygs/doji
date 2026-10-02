// Real overlapping sessions in a disposable, network-disabled synthetic clone.
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import assert from 'node:assert/strict';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe',
  container = 'supabase_db_employee-cutover-verify';
const info = JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' }))[0];
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const db = `identity_qa_${Date.now()}`;
assert.match(db, /^identity_qa_[0-9]+$/);
const args = (database) => [
  'exec',
  '-i',
  container,
  'psql',
  '-X',
  '-qAt',
  '-U',
  'postgres',
  '-d',
  database,
  '-v',
  'ON_ERROR_STOP=1',
];
const sync = (sql, database = db) =>
  execFileSync(podman, args(database), {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 4e6,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const children = new Set();
function start(sql, end = true) {
  const child = execFile(podman, args(db), { encoding: 'utf8' });
  children.add(child);
  let stdout = '',
    stderr = '',
    readyResolve;
  const ready = new Promise((r) => (readyResolve = r));
  child.stdout.on('data', (chunk) => {
    stdout += chunk;
    if (stdout.includes('identity_lock_held')) readyResolve();
  });
  child.stderr.on('data', (chunk) => (stderr += chunk));
  const done = new Promise((resolve) => {
    child.on('error', (error) => {
      children.delete(child);
      resolve({ code: -1, stdout, stderr, error });
    });
    child.on('close', (code) => {
      children.delete(child);
      resolve({ code, stdout, stderr });
    });
  });
  child.stdin.write(sql + '\n');
  if (end) child.stdin.end();
  return { child, done, ready };
}
let sequence = 0;
async function overlap(first, second) {
  const label = `identity_contender_${++sequence}`;
  const prefix = "begin;set local lock_timeout='6s';set local statement_timeout='8s';";
  const a = start(prefix + first + '\n\\echo identity_lock_held', false);
  await Promise.race([
    a.ready,
    a.done.then((r) => {
      throw Error('First transaction failed: ' + r.stderr);
    }),
  ]);
  const b = start(prefix + `set local application_name='${label}';` + second + 'commit;');
  let blocked = false;
  try {
    for (let i = 0; i < 30; i++) {
      if (
        sync(
          `select count(*) from pg_stat_activity where datname='${db}' and application_name='${label}' and wait_event_type='Lock';`,
        ) === '1'
      ) {
        blocked = true;
        break;
      }
      await delay(50);
    }
    assert.ok(blocked, 'second connection must actually wait on first connection lock');
  } finally {
    a.child.stdin.end('commit;\n');
  }
  const [left, right] = await Promise.all([a.done, b.done]);
  assert.equal(left.code, 0, left.stderr);
  return right;
}
const principal = '85000000-0000-4000-8000-000000000001';
const resolve = (sid = 'sid') =>
  `select * from portal_identity_private.resolve_identity('business','https://issuer.example.test/','business','owner','${sid}',true);`;
const read = () =>
  `select portal_identity_private.read_business_application('https://issuer.example.test/','business','owner','fresh',true);`;
const pass = (label) => console.log('PASS: ' + label);
let created = false,
  businessRole = false,
  resolverRole = false;
try {
  assert.equal(
    sync(
      "select count(*) from auth.users where email is null or email not like '%@test.invalid';select count(*) from vault.secrets;select count(*) from pg_roles where rolname in('doji_business','doji_identity_resolver');",
      'postgres',
    ),
    '0\n0\n0',
  );
  sync(`create database ${db} template postgres;`, 'postgres');
  created = true;
  sync(readFileSync('docs/drafts/business_applications_v1.sql', 'utf8'));
  businessRole = true;
  sync(readFileSync('docs/drafts/portal_identity_registry_v1.sql', 'utf8'));
  resolverRole = true;
  sync(readFileSync('docs/drafts/portal_identity_business_reads_v1.sql', 'utf8'));
  sync(readFileSync('docs/drafts/business_signup_legal_v1.sql', 'utf8'));
  sync(readFileSync('docs/drafts/portal_identity_business_commands_v1.sql', 'utf8'));
  sync(`insert into portal_identity_private.realms(realm,enabled,issuer,audience) values('business',true,'https://issuer.example.test/','business');
 update business_private.settings set enabled=true,application_terms_version='test',privacy_version='test';
 update portal_identity_private.business_read_settings set enabled=true;`);
  const bind = `select portal_identity_private.bind_identity('business','owner','${principal}','synthetic race');`;
  let raced = await overlap(bind, bind);
  assert.equal(raced.code, 0, raced.stderr);
  assert.equal(
    sync(
      'select count(*) from portal_identity_private.principals;select count(*) from portal_identity_private.mapping_audit;',
    ),
    '1\n1',
  );
  pass('overlapping duplicate binding creates one principal and one audit');
  raced = await overlap(
    bind,
    "select portal_identity_private.bind_identity('business','owner','85000000-0000-4000-8000-000000000002','conflict');",
  );
  assert.notEqual(raced.code, 0);
  assert.match(raced.stderr, /already bound/);
  pass('overlapping conflicting binding cannot redirect account');
  sync(
    `select portal_identity_private.set_principal_state('${principal}',1,'active','synthetic');insert into business_private.accounts(id) values('${principal}');`,
  );
  raced = await overlap(
    "select portal_identity_private.revoke_session('business','owner','sid','synthetic');",
    resolve(),
  );
  assert.notEqual(raced.code, 0);
  assert.match(raced.stderr, /Portal identity denied/);
  pass('revocation committing while resolution waits is observed and denied');
  raced = await overlap(
    resolve('first'),
    "select portal_identity_private.revoke_session('business','owner','first','synthetic');",
  );
  assert.equal(raced.code, 0, raced.stderr);
  const after = await start('begin;' + resolve('first') + 'rollback;').done;
  assert.notEqual(after.code, 0);
  assert.match(after.stderr, /Portal identity denied/);
  pass('in-flight authorized transaction finishes before revocation; next request is denied');
  raced = await overlap(
    `select portal_identity_private.set_principal_state('${principal}',2,'disabled','synthetic');`,
    read(),
  );
  assert.notEqual(raced.code, 0);
  assert.match(raced.stderr, /Portal identity denied/);
  pass('identity disable committing while business read waits is observed');
  sync(
    `select portal_identity_private.set_principal_state('${principal}',3,'active','synthetic');`,
  );
  raced = await overlap(
    `update business_private.accounts set disabled=true where id='${principal}';`,
    read(),
  );
  assert.notEqual(raced.code, 0);
  assert.match(raced.stderr, /Business access disabled/);
  pass('application account disable committing while read waits is observed');
  sync('update business_private.accounts set disabled=false;');
  raced = await overlap(
    'update portal_identity_private.business_read_settings set enabled=false;',
    read(),
  );
  assert.notEqual(raced.code, 0);
  assert.match(raced.stderr, /unavailable/);
  pass('bridge freeze wins over a waiting read');
  for (const isolation of ['repeatable read', 'serializable']) {
    const result = await start(`begin isolation level ${isolation};${resolve('fresh')}rollback;`)
      .done;
    assert.notEqual(result.code, 0);
    assert.match(result.stderr, /requires read committed/);
    pass(isolation + ' cannot bypass fresh revocation read');
  }
  sync(`update portal_identity_private.business_command_settings set enabled=true;
    insert into business_private.signup_agreements(account_id,terms_version,privacy_version)
    values('${principal}','test','test');`);
  const details = JSON.stringify({
    legal_name: 'Example LLC',
    brand_name: 'Example',
    website: 'https://example.test',
    country: 'US',
    business_address: '123 Example St',
    representative_name: 'Test Owner',
    representative_role: 'Owner',
    category: 'Retail',
    purpose: 'Synthetic local verification',
  });
  const command = (action, revision, key, sid = 'writes', payload = details) =>
    `select portal_identity_private.business_application_command('https://issuer.example.test/','business','owner','${sid}',true,'${action}',${revision},'${payload}'::jsonb,'test','test','${key}');`;
  const saveKey = '88000000-0000-4000-8000-000000000001';
  const submitKey = '88000000-0000-4000-8000-000000000002';
  const save = command('save', 'null', saveKey);
  raced = await overlap(save, save);
  assert.equal(raced.code, 0, raced.stderr);
  assert.match(raced.stdout, /"replayed": true/);
  assert.equal(
    sync(
      'select count(*) from business_private.applications;select count(*) from business_private.receipts;',
    ),
    '1\n1',
  );
  pass('overlapping first save serializes one application and one receipt');
  raced = await overlap(save, command('save', 'null', saveKey, 'writes', '{}'));
  assert.notEqual(raced.code, 0);
  assert.match(raced.stderr, /Retry key belongs to a different command/);
  pass('overlapping same-key different-payload save cannot overwrite');
  const submit = command('submit', '1', submitKey);
  raced = await overlap(submit, submit);
  assert.equal(raced.code, 0, raced.stderr);
  assert.match(raced.stdout, /"replayed": true/);
  assert.equal(
    sync(
      'select count(*) from business_private.submissions;select count(*) from business_private.receipts;select count(*) from business_private.history;',
    ),
    '1\n2\n2',
  );
  pass('overlapping submit produces one immutable submission and audit');
  raced = await overlap(
    "select portal_identity_private.revoke_session('business','owner','revoked-write','synthetic');",
    command('submit', '1', submitKey, 'revoked-write'),
  );
  assert.notEqual(raced.code, 0);
  assert.match(raced.stderr, /Portal identity denied/);
  pass('revocation committing before a waiting command denies receipt replay');
  raced = await overlap(
    submit,
    "select portal_identity_private.revoke_session('business','owner','writes','synthetic');",
  );
  assert.equal(raced.code, 0, raced.stderr);
  const afterWrite = await start('begin;' + submit + 'rollback;').done;
  assert.notEqual(afterWrite.code, 0);
  assert.match(afterWrite.stderr, /Portal identity denied/);
  pass('authorized command finishes before revocation; next command denied');
  assert.equal(sync(`select count(*) from auth.users where id='${principal}';`), '0');
  console.log('14 identity concurrency/isolation checks passed; no provider or production calls.');
} catch (e) {
  console.error(e.stderr?.toString() || e.stack);
  process.exitCode = 1;
} finally {
  const closing = [];
  for (const child of children) {
    closing.push(new Promise((resolve) => child.once('close', resolve)));
    if (!child.stdin.writableEnded) child.stdin.end('rollback;\n');
  }
  await Promise.all(closing);
  // Drop only this run's validated disposable clone. Never the restored baseline.
  if (created) {
    sync(`drop database ${db};`, 'postgres');
    console.log('Removed this run’s synthetic identity clone; baseline retained.');
  }
  if (resolverRole) sync('drop role doji_identity_resolver;', 'postgres');
  if (businessRole) sync('drop role doji_business;', 'postgres');
}
