// Disposable synthetic clone, network-disabled existing PostgreSQL only.
import { execFile, execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import type {ExecFileException} from 'node:child_process';
import {offlineContainer,errorOutput,message} from './database/contracts.mts';
import {evidenceRecord,evidenceAt,evidenceText,evidenceNumber} from './release-evidence.mts';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe',
  container = 'supabase_db_employee-cutover-verify';
const info = offlineContainer(JSON.parse(execFileSync(podman, ['inspect', container], { encoding: 'utf8' })));
assert.equal(info.HostConfig.NetworkMode, 'none');
assert.equal(Object.keys(info.HostConfig.PortBindings || {}).length, 0);
const db = `business_qa_${Date.now()}`;
assert.match(db, /^business_qa_[0-9]+$/);
const args = (database:string) => [
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
const sync = (sql:string, database = db) =>
  execFileSync(podman, args(database), {
    input: sql,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
const run = (sql:string) =>
  new Promise<{error:ExecFileException|null;stdout:string;stderr:string}>((resolve) => {
    const child = execFile(podman, args(db), { encoding: 'utf8' }, (error, stdout, stderr) =>
      resolve({ error, stdout, stderr }),
    );
    assert.ok(child.stdin);child.stdin.end(sql);
  });
const quote = (value:unknown) => `'${String(value).replaceAll("'", "''")}'`;
const parse = (output:string) => evidenceRecord(JSON.parse(evidenceText(output.split('\n').reverse().find((line) => line.startsWith('{')))));
const checks:string[] = [];
const passed = (label:string) => {
  checks.push(label);
  console.log(`PASS: ${label}`);
};
let created = false,
  roleCreated = false;
// First transaction signals after the command acquires its locks, then holds them
// while a second connection tries the competing command. Not sequential replay.
async function overlap(first:string, second:string) {
  const child = execFile(podman, args(db), { encoding: 'utf8' });
  assert.ok(child.stdin&&child.stdout&&child.stderr);
  let output = '', errors = '';
  let resolveReady!:()=>void;
  const ready = new Promise<void>((resolve) => {
    resolveReady = resolve;
  });
  child.stdout.on('data', (chunk) => {
    output += chunk;
    if (output.includes('business_lock_held')) resolveReady();
  });
  child.stderr.on('data', (chunk) => {
    errors += chunk;
  });
  const done = new Promise<string>((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => (code === 0 ? resolve(output) : reject(Error(errors))));
  });
  child.stdin.end(`${first}\n\\echo business_lock_held\nselect pg_sleep(1);commit;`);
  await Promise.race([
    ready,
    done.then(() => {
      throw Error('Missing lock marker');
    }),
  ]);
  const other = run(`${second}commit;`);
  return { first: await done, second: await other };
}
try {
  assert.equal(
    sync(
      "select count(*) from auth.users where email is null or email not like '%@test.invalid';select count(*) from vault.secrets;select count(*) from pg_roles where rolname='doji_business';",
      'postgres',
    ),
    '0\n0\n0',
  );
  sync(`create database ${db} template postgres;`, 'postgres');
  created = true;
  sync(readFileSync('docs/drafts/business_applications_v1.sql', 'utf8'));
  roleCreated = true;
  sync(readFileSync('docs/drafts/business_auth_v1.sql', 'utf8'));
  sync(readFileSync('docs/drafts/business_public_admission_v1.sql', 'utf8'));
  sync(readFileSync('docs/drafts/business_realtime_v1.sql', 'utf8'));
  sync(
    "grant doji_business to postgres;update business_private.settings set enabled=true,application_terms_version='qa-terms',privacy_version='qa-privacy';",
  );
  const owner = randomUUID(),
    staff = sync("select id from public.admin_employees where 'super_admin'=any(roles) limit 1;");
  assert.ok(staff);
  sync(
    `insert into auth.users(id,email,role,raw_app_meta_data,raw_user_meta_data,email_confirmed_at) values(${quote(owner)},'concurrent-business@test.invalid','doji_business','{"account_type":"business"}','{}',now());`,
  );
  const prefix = (id:string, role = 'doji_business') =>
    `begin;set local lock_timeout='5s';set local statement_timeout='8s';set local request.jwt.claims=${quote(JSON.stringify({ sub: id, role, aal: 'aal2' }))};set local role ${role};`;
  const details = {
    legal_name: 'Concurrency LLC',
    brand_name: 'Concurrency',
    website: 'https://example.test',
    country: 'US',
    business_address: '123 Synthetic Street',
    representative_name: 'Test Owner',
    representative_role: 'Owner',
    category: 'Technology',
    purpose: 'Synthetic validation only',
  };
  const cmd = (action:string, revision:number|null, key:string) =>
    `select public.business_application_command_v1(${quote(action)},${revision ?? 'null'},${quote(JSON.stringify(details))},'qa-terms','qa-privacy',${quote(key)});`;
  const key = randomUUID();
  let raced = await overlap(
    prefix(owner) + cmd('submit', null, key),
    prefix(owner) + cmd('submit', null, key),
  );
  assert.equal(raced.second.error, null, raced.second.stderr);
  assert.equal(parse(raced.first).replayed, false);
  assert.equal(parse(raced.second.stdout).replayed, true);
  assert.equal(
    sync(
      'select count(*) from business_private.applications;select count(*) from business_private.submissions;select count(*) from business_private.receipts;',
    ),
    '1\n1\n1',
  );
  passed('simultaneous identical first submissions: one application, snapshot and receipt');
  const app = evidenceAt(parse(raced.first),'outcome').id;
  const review = (action:string, revision:number, key:string) =>
    `select public.admin_business_application_command_v1(${quote(app)},${revision},${quote(action)},'Synthetic applicant response.','Synthetic internal rationale.',${quote(key)});`;
  const approval = randomUUID();
  raced = await overlap(
    prefix(staff, 'doji_employee') + review('approve', 1, approval),
    prefix(staff, 'doji_employee') + review('approve', 1, approval),
  );
  assert.equal(raced.second.error, null, raced.second.stderr);
  assert.equal(parse(raced.second.stdout).replayed, true);
  assert.equal(
    sync(
      'select count(*) from business_private.organizations;select count(*) from business_private.memberships;',
    ),
    '1\n1',
  );
  assert.equal(
    sync(`select count(*) from public.admin_audit_log where entity_id=${quote(app)};`),
    '1',
  );
  passed('overlapping duplicate approval: one organization, owner and audit decision');
  sync(prefix(staff, 'doji_employee') + review('reopen', 2, randomUUID()) + 'commit;');
  raced = await overlap(
    prefix(owner) + cmd('submit', 3, randomUUID()),
    prefix(owner) + cmd('save', 3, randomUUID()),
  );
  assert.ok(
    raced.second.error && raced.second.stderr.includes('Application changed'),
    raced.second.stderr,
  );
  assert.equal(sync('select count(*) from business_private.submissions;'), '2');
  passed('overlapping submit and stale save: committed submission cannot be overwritten');
  raced = await overlap(
    prefix(staff, 'doji_employee') + review('approve', 4, randomUUID()),
    prefix(staff, 'doji_employee') + review('decline', 4, randomUUID()),
  );
  assert.ok(
    raced.second.error && raced.second.stderr.includes('Application changed'),
    raced.second.stderr,
  );
  assert.equal(
    sync(
      'select state from business_private.applications;select count(*) from business_private.organizations;',
    ),
    'approved\n1',
  );
  passed('conflicting reviews: exactly one decision, stale competitor rejected');
  sync(prefix(staff, 'doji_employee') + review('reopen', 5, randomUUID()) + 'commit;');
  raced = await overlap(
    `begin;update business_private.accounts set disabled=true where id=${quote(owner)};`,
    prefix(owner) + cmd('submit', 6, randomUUID()),
  );
  assert.ok(
    raced.second.error && raced.second.stderr.includes('Business access disabled'),
    raced.second.stderr,
  );
  assert.equal(
    sync(
      'select state from business_private.applications;select count(*) from business_private.submissions;',
    ),
    'changes_requested\n2',
  );
  passed('disable commits while submission waits: no new snapshot or command accepted');
  sync(`update business_private.accounts set disabled=false where id=${quote(owner)};
    update business_private.settings set realtime_enabled=true;
    insert into business_private.realtime_budgets values(${quote(owner)},now(),23);`);
  raced = await overlap(
    prefix(owner) + 'select public.get_business_realtime_capability_v1();',
    prefix(owner) + 'select public.get_business_realtime_capability_v1();',
  );
  assert.equal(raced.second.error, null, raced.second.stderr);
  assert.equal(parse(raced.first).allowed, true);
  assert.equal(parse(raced.second.stdout).allowed, false);
  assert.equal(
    sync(`select used from business_private.realtime_budgets where account_id=${quote(owner)};`),
    '24',
  );
  passed('concurrent token renewals reserve the final slot exactly once');
  raced = await overlap(
    `begin;update business_private.accounts set disabled=true where id=${quote(owner)};`,
    prefix(owner) + 'select public.get_business_realtime_capability_v1();',
  );
  assert.ok(
    raced.second.error && raced.second.stderr.includes('Business access disabled'),
    raced.second.stderr,
  );
  passed('disabled account wins against waiting token authorization');
  sync(
    "update business_private.auth_settings set enabled=true,pilot_until=now()+interval '1 hour',allowed_emails=array['slot-one@test.invalid','slot-two@test.invalid'],registration_limit=1,email_limit=1;",
  );
  const admission = (email:string) =>
    `begin;set local role service_role;select public.claim_business_auth_v1('register',${quote(email)});`;
  raced = await overlap(admission('slot-one@test.invalid'), admission('slot-two@test.invalid'));
  assert.equal(raced.second.error, null, raced.second.stderr);
  assert.equal(parse(raced.first).allowed, true);
  assert.equal(parse(raced.second.stdout).allowed, false);
  assert.equal(
    sync('select registrations_used,emails_used from business_private.auth_settings;'),
    '1|1',
  );
  passed('concurrent admission competes for last slot: one account and email reservation');
  sync(
    "update business_private.public_auth_settings set enabled=true,registration_open=true,admission_until=now()+interval '1 hour',registration_limit=1,email_limit=10,daily_email_limit=10;",
  );
  const publicAdmission = (email:string) =>
    `begin;set local role service_role;select public.claim_public_business_auth_v1('register',${quote(email)});`;
  raced = await overlap(
    publicAdmission('public-one@test.invalid'),
    publicAdmission('public-two@test.invalid'),
  );
  assert.equal(raced.second.error, null, raced.second.stderr);
  assert.equal(parse(raced.first).allowed, true);
  assert.equal(parse(raced.second.stdout).allowed, false);
  assert.equal(
    sync('select registrations_used,emails_used from business_private.public_auth_settings;'),
    '1|1',
  );
  passed('concurrent public signup reserves last account exactly once without allowlist');
  sync(
    'update business_private.public_auth_settings set registration_limit=10,daily_email_limit=2;',
  );
  raced = await overlap(
    publicAdmission('public-three@test.invalid'),
    publicAdmission('public-four@test.invalid'),
  );
  assert.equal(raced.second.error, null, raced.second.stderr);
  assert.equal(parse(raced.first).allowed, true);
  assert.equal(parse(raced.second.stdout).allowed, false);
  assert.equal(
    sync(
      'select registrations_used,emails_used,daily_emails_used from business_private.public_auth_settings;',
    ),
    '2|2|2',
  );
  passed('concurrent public signup cannot overspend last daily email reservation');
  sync(readFileSync('docs/drafts/business_signup_legal_v1.sql', 'utf8'));
  sync(readFileSync('docs/drafts/business_privacy_v1.sql', 'utf8'));
  sync(
    `update business_private.privacy_settings set enabled=true; update business_private.accounts set disabled=false where id=${quote(owner)};`,
  );
  const openKey = randomUUID();
  const openPrivacy = `select public.admin_business_privacy_open_v1(${quote(owner)},'erasure','case:concurrency-proof','2026-10-30T00:00:00Z',${quote(openKey)});`;
  raced = await overlap(
    prefix(staff, 'doji_employee') + openPrivacy,
    prefix(staff, 'doji_employee') + openPrivacy,
  );
  assert.equal(raced.second.error, null, raced.second.stderr);
  const privacyCase = parse(raced.first).id;
  assert.equal(parse(raced.second.stdout).id, privacyCase);
  assert.equal(sync('select count(*) from business_private.privacy_cases;'), '1');
  passed('overlapping privacy intake retry produces one case and audit record');
  const correctionCase = parse(
    sync(
      prefix(staff, 'doji_employee') +
        `select public.admin_business_privacy_open_v1(${quote(owner)},'correction','case:correction-proof','2026-10-30T00:00:00Z',${quote(randomUUID())});commit;`,
    ),
  ).id;
  const draftRead = () =>
    parse(
      sync(
        prefix(staff, 'doji_employee') +
          `select public.get_admin_business_privacy_correction_v1(${quote(correctionCase)});commit;`,
      ),
    );
  const beforeDraft = draftRead();
  assert.equal(beforeDraft.correction_allowed, true);
  const correctionCommand = (revision:number, key:string) =>
    `select public.admin_business_privacy_command_v1(${quote(correctionCase)},1,'correct_draft','case:correction-proof',${quote(key)},${quote(JSON.stringify({ ...details, brand_name: 'Corrected concurrency' }))},${revision});`;
  raced = await overlap(
    prefix(owner) + cmd('save', evidenceNumber(evidenceAt(beforeDraft,'application').revision), randomUUID()),
    prefix(staff, 'doji_employee') +
      correctionCommand(evidenceNumber(evidenceAt(beforeDraft,'application').revision), randomUUID()),
  );
  assert.ok(
    raced.second.error && raced.second.stderr.includes('Application changed'),
    raced.second.stderr,
  );
  assert.equal(evidenceNumber(evidenceAt(draftRead(),'application').revision), evidenceNumber(evidenceAt(beforeDraft,'application').revision) + 1);
  passed('current-draft read cannot authorize an overwrite after a concurrent applicant save');
  const correctionKey = randomUUID(),
    freshDraft = draftRead();
  raced = await overlap(
    prefix(staff, 'doji_employee') +
      correctionCommand(evidenceNumber(evidenceAt(freshDraft,'application').revision), correctionKey),
    prefix(staff, 'doji_employee') +
      correctionCommand(evidenceNumber(evidenceAt(freshDraft,'application').revision), correctionKey),
  );
  assert.equal(raced.second.error, null, raced.second.stderr);
  assert.deepEqual(parse(raced.first), parse(raced.second.stdout));
  assert.equal(evidenceNumber(evidenceAt(draftRead(),'application').revision), evidenceNumber(evidenceAt(freshDraft,'application').revision) + 1);
  assert.equal(
    sync(
      `select count(*) from business_private.submissions where application_id=${quote(app)} and details->>'brand_name'='Corrected concurrency';`,
    ),
    '0',
  );
  passed('overlapping identical draft corrections commit once and preserve submitted snapshots');
  const privacy = (action:string, rev:number) =>
    `select public.admin_business_privacy_command_v1(${quote(privacyCase)},${rev},${quote(action)},'case:concurrent-review',${quote(randomUUID())});`;
  raced = await overlap(
    prefix(staff, 'doji_employee') + privacy('hold', 1),
    prefix(staff, 'doji_employee') + privacy('prepare_erasure', 1),
  );
  assert.ok(
    raced.second.error && raced.second.stderr.includes('Privacy case changed'),
    raced.second.stderr,
  );
  assert.equal(
    sync(`select state from business_private.privacy_cases where id=${quote(privacyCase)};`),
    'open',
  );
  passed('concurrent hold wins against stale erasure approval');
  sync(prefix(staff, 'doji_employee') + privacy('release_hold', 2) + 'commit;');
  sync(prefix(staff, 'doji_employee') + privacy('prepare_erasure', 3) + 'commit;');
  const execution = randomUUID();
  const claim = `begin;set local role service_role;select public.claim_business_erasure_v1(${quote(privacyCase)},${quote(execution)});`;
  raced = await overlap(claim, claim);
  assert.equal(raced.second.error, null, raced.second.stderr);
  assert.equal(parse(raced.first).delete_authorized, true);
  assert.equal(parse(raced.second.stdout).delete_authorized, false);
  passed('overlapping executor retries authorize exactly one Auth DELETE');
  mkdirSync('test-results/business-foundation-20260929', { recursive: true });
  writeFileSync(
    'test-results/business-foundation-20260929/concurrency-result.json',
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        passed: true,
        checks,
        productionChanged: false,
        environment: 'network-disabled disposable synthetic PostgreSQL clone',
        hostedAuthQualified: false,
      },
      null,
      2,
    ) + '\n',
  );
} catch (error) {
  console.error(errorOutput(error,'stderr') || message(error));
  process.exitCode = 1;
} finally {
  if (created) {
    sync(`drop database ${db};`, 'postgres');
    console.log('Removed only this run’s synthetic QA clone; original database retained.');
  }
  if (roleCreated) {
    sync('drop role doji_business;', 'postgres');
    console.log('Removed only the role created by this isolated test run.');
  }
}
