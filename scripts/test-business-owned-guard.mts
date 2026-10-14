// Only a newly owned, network-disabled PostgreSQL container. No remote target args.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createCleanRoom, installManagedSchemas, replay } from './database/clean-room.mts';
import { engine } from './database/config.mts';
import { errorOutput } from './database/contracts.mts';
import { resetRoundTrip } from './test-business-owned-reset-roundtrip.mts';
assert.equal(process.argv.length, 2);
const room = createCleanRoom();
const read = (path: string) => readFileSync(path, 'utf8').replaceAll('\r\n', '\n');
const sql = (source: string) =>
  // The legacy SQL fixture alias maps to the same pinned issuer as the real
  // server adapters. Seed it correctly; never change/disable realm immutability.
  room.sql(
    `set role postgres;set search_path=public,extensions;${source.replaceAll('https://business.test', 'https://api.workos.com/user_management/client_business')}`,
  );
const scope = "repeat('a',64)";
const hash = (n: string) => `md5('${n}')||md5('${n}')`;
const admit = (n: string, identity = 'identity', action = 'signin') =>
  `select business_session_private.admit_owned_auth_v1(${scope},'${action}',${hash(n)},${hash(identity)},${hash('network')});`;
const begin = (id: string, subject = 'user_one') =>
  `select business_session_private.begin_owned_reset_v1(${scope},${hash(id)},'https://business.test','client_business','${subject}');`;
const finish = (id: string) =>
  `select business_session_private.complete_owned_reset_v1(${scope},${hash(id)},'https://business.test','client_business','user_one');`;
const install = (ticket: string, key: string, subject = 'user_one') =>
  `select business_session_private.put_owned_session_v1(${scope},${hash(ticket)},${hash(key)},repeat('x',64),100000,'https://business.test','client_business','${subject}','session_test');`;
const resetFixture = () =>
  sql(`truncate business_session_private.owned_auth_tickets,business_session_private.owned_auth_buckets,business_session_private.owned_auth_resets,business_session_private.owned_auth_fences,business_session_private.records;
 update business_session_private.owned_auth_settings set enabled=true,scope_hash=${scope};`);
let checks = 0;
const pass = (label: string) => {
  checks++;
  console.log('PASS: ' + label);
};
const children = new Set<ReturnType<typeof execFile>>();
function start(source: string, hold = false) {
  source = source.replaceAll(
    'https://business.test',
    'https://api.workos.com/user_management/client_business',
  );
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
    { encoding: 'utf8', timeout: 15000 },
  );
  children.add(child);
  assert.ok(child.stdin && child.stdout && child.stderr);
  let out = '',
    err = '',
    ready!: () => void;
  const held = new Promise<void>((resolve) => {
    ready = resolve;
  });
  child.stdout.on('data', (chunk) => {
    out += chunk;
    if (out.includes('GUARD_HELD')) ready();
  });
  child.stderr.on('data', (chunk) => {
    err += chunk;
  });
  const done = new Promise<{ code: number | null; out: string; err: string }>((resolve) => {
    child.on('error', (e) => {
      children.delete(child);
      resolve({ code: -1, out, err: e.message });
    });
    child.on('close', (code) => {
      children.delete(child);
      resolve({ code, out, err });
    });
  });
  child.stdin.write(
    `begin;set local statement_timeout='10s';set local role doji_business_session;${source}\n`,
  );
  if (hold) child.stdin.write('\\echo GUARD_HELD\n');
  else child.stdin.end('commit;');
  return { child, held, done };
}
async function overlap(left: string, right: string) {
  const tag = `owned_guard_${checks}`;
  const a = start(left, true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      a.held,
      a.done.then((r) => {
        throw Error(r.err || 'First transaction ended early');
      }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error('Lock setup timeout')), 10000);
      }),
    ]);
    clearTimeout(timer);
    const b = start(`set local application_name='${tag}';${right}`);
    let waiting = false;
    for (let i = 0; i < 15; i++) {
      waiting =
        sql(
          `select exists(select 1 from pg_stat_activity where application_name='${tag}' and wait_event_type='Lock');`,
        ) === 't';
      if (waiting) break;
      await new Promise((resolve) => {
        setTimeout(resolve, 20);
      });
    }
    assert.ok(waiting, 'Second connection must actually wait on the first transaction');
    a.child.stdin!.end('commit;');
    const ar = await a.done,
      br = await b.done;
    assert.equal(ar.code, 0, ar.err);
    assert.equal(br.code, 0, br.err);
    return br.out;
  } finally {
    clearTimeout(timer);
    if (!a.child.stdin!.writableEnded) a.child.stdin!.end('rollback;');
  }
}
try {
  await room.start();
  installManagedSchemas(room);
  pass(`${(await replay(room)).length} migrations replayed in a fresh offline PostgreSQL`);
  for (const name of [
    'business_applications_v1',
    'business_auth_v1',
    'business_signup_legal_v1',
    'business_privacy_v1',
    'portal_identity_registry_v1',
    'portal_identity_business_enrollment_v1',
    'portal_identity_business_reads_v1',
    'portal_identity_business_commands_v1',
    'portal_identity_business_review_v1',
    'business_session_store_v1',
    'employee_session_store_v1',
    'portal_identity_business_privacy_v1',
  ])
    sql(read(`supabase/overlays/${name}.sql`));
  sql(`insert into portal_identity_private.realms values('business',true,'https://business.test','client_business'),('employee',true,'https://employee.test','client_employee');
    insert into portal_identity_private.principals(id,realm,state) values
    ('98110000-0000-4000-8000-000000000001','business','active'),('98110000-0000-4000-8000-000000000002','business','active'),('98110000-0000-4000-8000-000000000003','employee','active');
    insert into portal_identity_private.identities(realm,subject,principal_id) values
    ('business','user_one','98110000-0000-4000-8000-000000000001'),('business','user_two','98110000-0000-4000-8000-000000000002'),('employee','user_staff','98110000-0000-4000-8000-000000000003');
    insert into business_private.accounts(id) select id from portal_identity_private.principals where realm='business';
    update business_session_private.settings set enabled=true,scope_hash=${scope};
    grant doji_business_session to postgres;
    insert into auth.users(id,aud,role,email,email_confirmed_at,raw_user_meta_data) values('98110000-0000-4000-8000-000000000004','authenticated','authenticated','owned-guard-member@test.invalid',clock_timestamp(),jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',clock_timestamp(),'privacy_accepted_at',clock_timestamp()));
    insert into public.profiles(id,username,display_name) values('98110000-0000-4000-8000-000000000004','guard_member','Synthetic guard member') on conflict(id) do nothing;`);
  const fingerprint = () =>
    sql(`select md5(string_agg(x,'|' order by x)) from (
    select pg_get_functiondef(oid)||coalesce(proacl::text,'') x from pg_proc where prokind='f'
      and pronamespace in ('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'portal_identity_private'::regnamespace,'employee_session_private'::regnamespace,'business_session_private'::regnamespace)
      and proname not like '%owned%'
    union all select to_jsonb(p)::text from pg_policies p
    union all select oid::text||coalesce(relacl::text,'')||relrowsecurity::text from pg_class where relkind in('r','p') and relname not like 'owned_auth_%'
    union all select to_jsonb(u)::text from auth.users u
    union all select to_jsonb(p)::text from public.profiles p
    union all select to_jsonb(p)::text from portal_identity_private.principals p
    union all select to_jsonb(r)::text from employee_session_private.records r
    union all select to_jsonb(m)::text from pg_auth_members m) preserved;`);
  const memberRead = () =>
    sql(`set role authenticated;
    set request.jwt.claim.sub='98110000-0000-4000-8000-000000000004';
    select count(*) from public.profiles where id=auth.uid();`);
  const employeeRead = () =>
    sql(`set role doji_identity_resolver;
    select principal_id from portal_identity_private.resolve_identity('employee','https://employee.test','client_employee','user_staff','session_staff',true);`);
  assert.equal(memberRead(), '1');
  assert.equal(employeeRead(), '98110000-0000-4000-8000-000000000003');
  const before = fingerprint();
  sql(read('supabase/overlays/business_owned_auth_guard_v1.sql'));
  sql(read('supabase/overlays/business_owned_reset_links_v1.sql'));
  sql(read('supabase/overlays/business_owned_store_v1.sql'));
  sql(read('supabase/overlays/business_owned_acceptance_v1.sql'));
  sql(read('supabase/overlays/business_owned_recovery_email_v1.sql'));
  const mailOutput = sql(`begin;${read('scripts/test-business-owned-recovery-email.sql')}
    ${read('supabase/overlays/business_owned_recovery_email_v1.rollback.sql').replace(/^begin;|^commit;/gm, '')}
    select pg_temp.ok((select enabled_until is null from business_session_private.owned_auth_mail_settings),'mail rollback closes gate');
    select pg_temp.ok((select count(*)=69 from business_session_private.owned_auth_mail_reservations),'mail rollback retains spent reservations');
    rollback;`);
  for (const line of mailOutput.split('\n').filter((line) => line.startsWith('PASS:'))) {
    checks++;
    console.log(line);
  }
  const acceptanceOutput = sql(`begin;${read('scripts/test-business-owned-acceptance.sql')}
    ${read('supabase/overlays/business_owned_acceptance_v1.rollback.sql').replace(/^begin;|^commit;/gm, '')}
    select pg_temp.ok(not (select enabled from business_session_private.owned_auth_acceptance),'acceptance rollback closes test gate');
    select pg_temp.ok((select reserved_at is not null from business_session_private.owned_auth_acceptance),'acceptance rollback retains spent slot');
    rollback;`);
  for (const line of acceptanceOutput.split('\n').filter((line) => line.startsWith('PASS:'))) {
    checks++;
    console.log(line);
  }
  {
      const output = sql(`begin;
        ${read('supabase/overlays/business_owned_existing_test_access_v1.sql').replace(/^begin;|^commit;/gm, '')}
        ${read('scripts/test-business-owned-acceptance.sql')}
        ${read('scripts/test-business-existing-test-access.sql')}
        rollback;`);
      for (const line of output.split('\n').filter(line => line.startsWith('PASS:'))) {
        checks++; console.log(line);
      }
  }
  const cutover =
    sql(`begin;${read('supabase/overlays/business_owned_cutover_v1.sql').replace(/^begin;|^commit;/gm, '')}
    ${read('scripts/test-business-owned-cutover.sql')}
    ${read('supabase/overlays/business_owned_cutover_v1.rollback.sql').replace(/^begin;|^commit;/gm, '')}
    select pg_temp.ok(not (select enabled from business_session_private.owned_auth_settings),'cutover rollback freezes owned installers');
    select pg_temp.ok(not has_function_privilege('doji_business_session','business_session_private.put_bound_session(text,text,text,integer,text,text,text,text)','execute'),'cutover rollback does not silently re-enable legacy bypass');
    rollback;`);
  for (const line of cutover.split('\n').filter((line) => line.startsWith('PASS:'))) {
    checks++;
    console.log(line);
  }
  assert.equal(fingerprint(), before);
  const output = sql(`begin;${read('scripts/test-business-owned-guard.sql')}rollback;`);
  const assertions = output.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(assertions.length >= 30, 'Expected complete SQL assertion set');
  for (const line of assertions) {
    checks++;
    console.log(line);
  }
  const resetOutput = sql(`begin;${read('scripts/test-business-owned-reset-links.sql')}rollback;`);
  const resetAssertions = resetOutput.split('\n').filter((line) => line.startsWith('PASS:'));
  assert.ok(resetAssertions.length >= 30, 'Expected complete reset-link SQL assertions');
  for (const line of resetAssertions) {
    checks++;
    console.log(line);
  }
  assert.equal(fingerprint(), before);
  pass('existing function bodies/grants, policies, member rows and employee state unchanged');
  resetFixture();
  sql(`update business_session_private.owned_auth_mail_settings set enabled_until=clock_timestamp()+interval '1 hour';
    insert into business_session_private.owned_auth_tickets(key_hash,action,epoch,expires_at)
    select md5('mailrace'||n)||md5('mailrace'||n),'recover',1,clock_timestamp()+interval '5 minutes' from generate_series(1,3) n;
    insert into business_session_private.owned_auth_mail_reservations(ticket_hash)
    select md5('mailseed'||n)||md5('mailseed'||n) from generate_series(1,9) n;`);
  const mailReserve = (n: number) =>
    `select business_session_private.reserve_owned_recovery_email_v1(${scope},md5('mailrace${n}')||md5('mailrace${n}'));`;
  assert.match(await overlap(mailReserve(1), mailReserve(2)), /limited/);
  pass('concurrent mail requests cannot exceed the ten-per-day cap');
  assert.equal(
    sql('select count(*) from business_session_private.owned_auth_mail_reservations;'),
    '10',
  );
  sql(
    "update business_session_private.owned_auth_mail_reservations set reserved_at=clock_timestamp()-interval '2 days';",
  );
  assert.match(await overlap(mailReserve(3), mailReserve(3)), /spent/);
  pass('concurrent duplicate mail ticket permits only one send');
  sql(read('supabase/overlays/business_owned_recovery_email_v1.rollback.sql'));
  assert.equal(
    sql('select count(*) from business_session_private.owned_auth_mail_reservations;'),
    '11',
  );
  pass('mail rollback preserves spent capacity across runtime restarts');
  resetFixture();
  sql(
    `update business_session_private.owned_auth_acceptance set enabled=true,scope_hash=${scope},identity_hmac=${hash('identity')},started_at=clock_timestamp(),expires_at=clock_timestamp()+interval '1 hour';`,
  );
  const reserveAcceptance = (id: string) =>
    `select business_session_private.reserve_owned_acceptance_v1(${scope},${hash('identity')},${hash(id)},${hash('agreement')});`;
  assert.equal(
    (await overlap(reserveAcceptance('first'), reserveAcceptance('second'))).trim(),
    'f',
  );
  pass('concurrent acceptance registrations cannot consume more than one provider-create slot');
  sql('update business_session_private.owned_auth_acceptance set enabled=false;');
  for (let n = 0; n < 9; n++) sql(admit('cap' + n));
  assert.match(await overlap(admit('cap9'), admit('cap10')), /limited/);
  assert.equal(
    sql("select attempts from business_session_private.owned_auth_buckets where kind='identity';"),
    '10',
  );
  pass('concurrent requests cannot overshoot identity cap');
  resetFixture();
  assert.match(await overlap(admit('same'), admit('same')), /duplicate/);
  pass('concurrent replay permits only one provider attempt');
  resetFixture();
  sql(admit('old'));
  assert.match(await overlap(begin('reset1'), install('old', 'old-session')), /denied/);
  pass('reset winning race prevents inflight sign-in installation');
  resetFixture();
  sql(admit('old'));
  await overlap(install('old', 'old-session'), begin('reset1'));
  assert.equal(
    sql("select count(*) from business_session_private.records where kind='session';"),
    '0',
  );
  pass('sign-in winning race is removed when reset commits');
  sql(admit('during'));
  assert.match(await overlap(finish('reset1'), install('during', 'during-session')), /denied/);
  pass('ticket admitted during reset remains fenced after completion');
  sql(admit('fresh'));
  sql(install('fresh', 'fresh-session'));
  sql(finish('reset1'));
  assert.equal(
    sql("select count(*) from business_session_private.records where kind='session';"),
    '1',
  );
  pass('completion replay does not remove post-reset sessions');
  const link = (name: string, subject = 'user_one') =>
    sql(
      `select business_session_private.put_owned_reset_link_v1(${scope},${hash(name)},'password_reset_${name}',repeat('x',64),floor(extract(epoch from clock_timestamp()+interval '1 hour')*1000)::bigint,'https://business.test','client_business','${subject}');`,
    );
  const mappedBegin = (name: string, subject = 'user_one') =>
    `select business_session_private.begin_owned_reset_link_v1(${scope},${hash(name)},${hash('op' + name)},'https://business.test','client_business','${subject}');`;
  const reconcile = (name: string, subject = 'user_one') =>
    `select business_session_private.reconcile_owned_reset_link_v1(${scope},'event_${name}','password_reset_${name}','https://business.test','client_business','${subject}');`;
  link('race');
  assert.match(await overlap(mappedBegin('race'), mappedBegin('race')), /pending/);
  pass('two real concurrent mapped-link resets permit only one provider dispatch');
  const completeLink = `select business_session_private.complete_owned_reset_link_v1(${scope},${hash('oprace')},'https://business.test','client_business','user_one');`;
  assert.match(await overlap(reconcile('race'), completeLink), /complete/);
  pass('signed success and HTTP success racing complete one mapped reset safely');
  link('early', 'user_two');
  assert.match(
    await overlap(reconcile('early', 'user_two'), mappedBegin('early', 'user_two')),
    /denied/,
  );
  pass('success event winning before reset dispatch prevents using an already-consumed link');
  await resetRoundTrip(sql);
  pass(
    'actual reset store, coordinator, signature handler and PostgreSQL reconcile a lost response across adapter recreation without redispatch or fresh-session revocation',
  );
  const retained = sql('select count(*) from business_session_private.owned_auth_fences;');
  const retainedLinks = sql(
    'select count(*) from business_session_private.owned_auth_reset_links;',
  );
  sql(read('supabase/overlays/business_owned_reset_links_v1.rollback.sql'));
  assert.equal(
    sql(
      "select has_function_privilege('doji_business_session','business_session_private.get_owned_reset_link_v1(text,text)','execute');",
    ),
    'f',
  );
  sql(read('supabase/overlays/business_owned_auth_guard_v1.rollback.sql'));
  assert.equal(sql('select enabled from business_session_private.owned_auth_settings;'), 'f');
  assert.equal(sql('select count(*) from business_session_private.owned_auth_fences;'), retained);
  assert.equal(
    sql('select count(*) from business_session_private.owned_auth_reset_links;'),
    retainedLinks,
  );
  assert.equal(
    sql(
      "select has_function_privilege('doji_business_session','business_session_private.admit_owned_auth_v1(text,text,text,text,text)','execute');",
    ),
    'f',
  );
  assert.equal(fingerprint(), before);
  assert.equal(memberRead(), '1');
  assert.equal(employeeRead(), '98110000-0000-4000-8000-000000000003');
  pass(
    'member authorized profile read and independent employee resolution survive candidate and rollback',
  );
  pass(
    'retaining rollback closes access and preserves reset fences without changing member/employee contracts',
  );
  console.log(
    `${checks} offline database assertions passed; no provider calls or production changes.`,
  );
} catch (error) {
  console.error(errorOutput(error, 'stderr'));
  throw error;
} finally {
  for (const child of children) {
    child.stdin?.end('rollback;');
    child.kill();
  }
  room.stop();
}
