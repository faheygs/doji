// Owner-approved, bounded synthetic canary. No real cases, member users or emails.
import assert from 'node:assert/strict';
import { readFile, writeFile, access } from 'node:fs/promises';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import { Realtime } from 'ably';
import type { TokenRequest, Message } from 'ably';
import { cli } from './prepare-safety-launch.mts';
import { linkedWorkspace } from './business-disabled-release-reads.mts';
import { evidenceRecord, evidenceRows } from './release-evidence.mts';
import { contractHash, windowGuard } from './staff-workflow-release-guards.mts';
import { boundedBody } from '../infra/portal-identity-candidate/bounded-body.mts';
const root = 'test-results/staff-workflow-release',
  origin = 'https://admin.dojipro.com';
function totp(secret: string, now = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  assert.match(secret, /^[A-Z2-7]+$/);
  const bits = [...secret].map((c) => alphabet.indexOf(c).toString(2).padStart(5, '0')).join('');
  const key = Buffer.from((bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30000)));
  const digest = createHmac('sha1', key).update(counter).digest();
  return String((digest.readUInt32BE(digest[19]! & 15) & 0x7fffffff) % 1000000).padStart(6, '0');
}
assert.equal(totp('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 59000), '287082');
if (process.argv[2] !== '--approved-live') {
  assert.equal(process.argv.length, 2);
  console.log('Local TOTP vector passed. No network or production writes.');
  process.exit(0);
}
assert.equal(process.argv.length, 3);
await assert.rejects(access(`${root}/synthetic-started.json`));
const released = evidenceRecord(
  JSON.parse(await readFile(`${root}/promotion-edge-verified.json`, 'utf8')),
);
assert.equal(released.employeeVersion, 14);
const base = evidenceRecord(JSON.parse(await readFile(`${root}/candidate.json`, 'utf8')));
const expected = evidenceRecord(base.before).hash;
assert.match(String(expected), /^[a-f0-9]{32}$/);
const query = (sql: string) =>
  evidenceRows(
    cli(['db', 'query', sql, '--linked', '--workdir', linkedWorkspace, '--output-format', 'json']),
  );
const fenced = (body: string) =>
  query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';
  do $$begin ${windowGuard} if (${contractHash})<>'${expected}' then raise exception 'Contract drift';end if;end$$;
  ${body} commit;`);
// Check release/window before any provider account is created.
fenced('select 1;');
const cfg = evidenceRecord(
  JSON.parse(
    await readFile(`${linkedWorkspace}/.artifacts/workos-production/credentials.json`, 'utf8'),
  ),
);
assert.equal(cfg.productionOnly, true);
const employee = evidenceRecord(cfg.employee);
assert.equal(employee.environment, 'environment_01M3VE4WMDRZ1VBVS5MNVVF19J');
assert.equal(employee.clientId, 'client_01M3VE4WTBYS2XN6NZPH9EDMQD');
assert.equal(typeof employee.apiKey, 'string');
assert.notEqual(employee.apiKey, evidenceRecord(cfg.business).apiKey);
const staffId = randomUUID(),
  accountId = randomUUID(),
  caseId = randomUUID();
const email = `doji-workflow-${randomBytes(12).toString('hex')}@doji-isolation.test`;
const password = randomBytes(32).toString('base64url') + 'aA9!';
const label = 'Synthetic workflow acceptance - do not review';
const checks: string[] = [],
  timings: { operation: string; ms: number; status: number }[] = [];
let subject = '',
  stage = 'prepare',
  createdDatabase = false,
  providerDeleted = false,
  databaseDisabled = false;
let cookie = '',
  csrf = '',
  client: Realtime | undefined,
  httpCount = 0,
  authCount = 0,
  providerCalls = 0;
let passed = false,
  failure = '';
const write = (name: string, value: unknown) =>
  writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), { flag: 'wx' });
const checkpoint = (s: string) => {
  stage = s;
  console.log(JSON.stringify({ stage: s, checks: checks.length }));
};
async function responseValue(response: Response) {
  if (response.status === 204 || !response.body) return {};
  const bytes = await boundedBody(response.body, AbortSignal.timeout(10000), 131072);
  if (!bytes.length) return {};
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}
async function provider(path: string, method: string, body?: unknown) {
  assert.ok(++providerCalls <= 4);
  const response = await fetch('https://api.workos.com' + path, {
    method,
    redirect: 'error',
    headers: { authorization: `Bearer ${employee.apiKey}`, 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `Synthetic provider operation returned HTTP ${response.status}`);
  return responseValue(response);
}
async function request(path: string, body?: unknown) {
  assert.ok(++httpCount <= 40, 'Canary HTTP budget exhausted');
  assert.ok(
    ['/auth/start', '/auth/complete', '/api/session', '/api/rpc', '/auth/logout'].includes(path),
  );
  const at = Date.now();
  const response = await fetch(origin + path, {
    method: body ? 'POST' : 'GET',
    redirect: 'error',
    headers: {
      origin,
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
      ...(csrf ? { 'x-doji-csrf': csrf } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(20000),
  });
  for (const c of response.headers.getSetCookie()) {
    const pair = c.split(';')[0]!;
    if (pair.startsWith('__Host-doji_employee=') && pair.split('=')[1]) cookie = pair;
    else if (pair.startsWith('__Host-doji_employee_login=') && pair.split('=')[1]) cookie = pair;
  }
  const value = await responseValue(response);
  const record =
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? evidenceRecord(value)
      : {};
  if (typeof record.csrf === 'string') csrf = record.csrf;
  timings.push({ operation: path, ms: Date.now() - at, status: response.status });
  return { status: response.status, value };
}
async function rpc(name: string, args: Record<string, unknown> = {}, status = 200) {
  const r = await request('/api/rpc', { name, args });
  assert.equal(r.status, status, `Synthetic ${name} returned HTTP ${r.status}; expected ${status}`);
  return r.value;
}
const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
function eventWait(c: Realtime) {
  const channel = c.channels.get('staff:workflow:business');
  let timer: ReturnType<typeof setTimeout>;
  let handler: (message: Message) => void;
  const promise = new Promise<void>((resolve, reject) => {
    handler = (message) => {
      const d = evidenceRecord(message.data);
      if (
        message.name === 'staff.case.changed' &&
        d.id === caseId &&
        d.kind === 'business_application'
      ) {
        clearTimeout(timer);
        channel.unsubscribe(handler);
        resolve();
      }
    };
    timer = setTimeout(() => {
      channel.unsubscribe(handler);
      reject(Error('Synthetic realtime delivery not observed within 30 seconds'));
    }, 30000);
    channel.subscribe(handler).catch(() => {
      clearTimeout(timer);
      reject(Error('Synthetic subscription failed'));
    });
  });
  return promise;
}
async function startClient() {
  const c = new Realtime({
    autoConnect: false,
    logLevel: 0,
    authCallback: (_params, done) => {
      if (++authCount > 5) {
        done('Synthetic auth budget exhausted', null);
        return;
      }
      rpc('portal_realtime_token_v1')
        .then((token) => {
          const t = evidenceRecord(token);
          assert.equal(t.clientId, staffId);
          assert.equal(t.ttl, 900000);
          const capability =
            typeof t.capability === 'string' ? JSON.parse(t.capability) : t.capability;
          assert.deepEqual(capability, { 'staff:workflow:business': ['subscribe'] });
          done(null, token as TokenRequest);
        })
        .catch(() => done('Synthetic authorization unavailable', null));
    },
  });
  client = c;
  c.connect();
  await Promise.race([
    c.connection.once('connected'),
    wait(25000).then(() => {
      throw Error('Synthetic connection timeout');
    }),
  ]);
  await c.channels.get('staff:workflow:business').attach();
  return c;
}
async function cleanupDatabase() {
  // Cleanup only exact random IDs recorded before creation. No window fence can
  // keep temporary access enabled; transaction/row budgets remain bounded.
  query(`begin;set local lock_timeout='2s';set local statement_timeout='8s';
    do $$begin if exists(select 1 from public.admin_employees where id='${staffId}' and display_name<>'${label}')
      then raise exception 'Synthetic identity mismatch';end if;
      if exists(select 1 from business_private.applications where id='${caseId}' and applicant_id<>'${accountId}')
      then raise exception 'Synthetic application mismatch';end if;end$$;
    update public.admin_employees set status='disabled',roles='{}' where id='${staffId}' and display_name='${label}';
    select portal_identity_private.set_principal_state(id,revision,'disabled','Owner-approved synthetic acceptance cleanup')
      from portal_identity_private.principals where id='${staffId}' and realm='employee' and state<>'disabled';
    update portal_identity_private.identities set revoked=true where principal_id='${staffId}' and realm='employee';
    update business_private.accounts set disabled=true where id='${accountId}';
    update business_private.applications set state='declined',revision=revision+1,response='Synthetic acceptance complete; no real business decision.',updated_at=clock_timestamp()
      where id='${caseId}' and applicant_id='${accountId}' and state='pending';
    commit;`);
  const result = query(`begin read only;set local statement_timeout='5s';select
    not exists(select 1 from public.admin_employees where id='${staffId}' and (status<>'disabled' or cardinality(roles)<>0)) disabled,
    not exists(select 1 from portal_identity_private.identities where principal_id='${staffId}' and not revoked) revoked,
    not exists(select 1 from business_private.applications where id='${caseId}' and state<>'declined') closed,
    not exists(select 1 from auth.users where id in('${staffId}','${accountId}')) no_member_accounts,
    not exists(select 1 from business_private.organizations where application_id='${caseId}') no_organization,
    (select count(*) from staff_workflow_private.history where case_id='${caseId}') history_count;
    rollback;`)[0];
  assert.ok(
    result?.disabled &&
      result.revoked &&
      result.closed &&
      result.no_member_accounts &&
      result.no_organization,
  );
  databaseDisabled = true;
  return result;
}
await write('synthetic-started', {
  at: new Date().toISOString(),
  staffId,
  accountId,
  caseId,
  label,
  noMemberAccounts: true,
  noEmails: true,
});
try {
  checkpoint('create-provider-identity');
  const user = evidenceRecord(
    await provider('/user_management/users', 'POST', { email, password, email_verified: true }),
  );
  assert.equal(typeof user.id, 'string');
  subject = String(user.id);
  assert.match(subject, /^user_[A-Za-z0-9]+$/);
  await write('synthetic-provider', { subject, staffId, emailSynthetic: true });
  checkpoint('create-exact-synthetic-records');
  const details = JSON.stringify({
    legal_name: label,
    brand_name: label,
    website: 'https://example.test',
    country: 'US',
    representative_name: 'Synthetic',
    representative_role: 'QA',
    category: 'Technology',
    purpose: 'Owner-approved synthetic staff workflow acceptance only.',
  });
  // Only constant labelled details and validated random UUID/provider identifiers.
  fenced(`select portal_identity_private.bind_identity('employee','${subject}','${staffId}','Owner-approved synthetic workflow acceptance');
    select portal_identity_private.prepare_employee_actor_v1('${staffId}','Owner-approved synthetic workflow acceptance');
    insert into public.admin_employees(id,display_name,status,roles) values('${staffId}','${label}','active',array['business_reviewer']);
    select portal_identity_private.set_principal_state('${staffId}',1,'active','Owner-approved synthetic workflow acceptance');
    insert into business_private.accounts(id,disabled) values('${accountId}',true);
    insert into business_private.applications(id,applicant_id,state,submission,details,submitted_at)
      values('${caseId}','${accountId}','pending',1,'${details}'::jsonb,clock_timestamp());
    insert into business_private.submissions(application_id,submission,details,terms_version,privacy_version,accepted_at)
      select '${caseId}',1,'${details}'::jsonb,application_terms_version,privacy_version,clock_timestamp() from business_private.settings where singleton;`);
  createdDatabase = true;
  checkpoint('password-and-mfa');
  const begun = await request('/auth/start', { email, password });
  assert.equal(begun.status, 200);
  const flow = evidenceRecord(begun.value);
  assert.equal(flow.step, 'totp');
  assert.equal(typeof flow.enrollmentSecret, 'string');
  // Avoid submitting at the counter boundary; no OTP or password is logged/saved.
  if (Date.now() % 30000 > 25000) await wait(5000);
  const finished = await request('/auth/complete', { code: totp(String(flow.enrollmentSecret)) });
  assert.equal(finished.status, 200);
  const session = evidenceRecord(finished.value);
  assert.equal(session.assurance, 'aal2');
  assert.equal(evidenceRecord(session.operator).user_id, staffId);
  assert.equal(
    evidenceRecord(evidenceRecord(session.operator).capabilities).moderation_read,
    false,
  );
  checks.push('real password and TOTP sign-in, separate employee principal');
  const args = { p_kind: 'business_application', p_id: caseId };
  const own = evidenceRecord(await rpc('get_admin_case_ownership_v1', args));
  assert.equal(own.revision, 0);
  assert.equal(own.can_claim, true);
  assert.equal(own.can_decide, false);
  assert.deepEqual(await rpc('get_admin_staff_event_channels_v1'), ['staff:workflow:business']);
  await rpc('get_admin_case_ownership_v1', { p_kind: 'suggestion', p_id: caseId }, 403);
  await rpc(
    'admin_case_ownership_command_v1',
    {
      ...args,
      p_revision: 0,
      p_source_version: '1',
      p_action: 'assign',
      p_target: staffId,
      p_request_id: randomUUID(),
    },
    403,
  );
  checks.push('limited reviewer cannot read other queues or reassign even to self');
  checkpoint('realtime-claim');
  const c = await startClient();
  const initialToken = await c.auth.authorize();
  const initialAuth = authCount;
  const firstTokenExpiry = initialToken.expires;
  assert.ok(firstTokenExpiry && firstTokenExpiry > Date.now());
  const event = eventWait(c);
  event.catch(() => {});
  const command = {
    ...args,
    p_revision: 0,
    p_source_version: String(own.source_version),
    p_action: 'claim',
    p_target: null,
    p_request_id: randomUUID(),
  };
  const claimed = evidenceRecord(await rpc('admin_case_ownership_command_v1', command));
  assert.equal(claimed.revision, 1);
  await event;
  assert.equal(
    evidenceRecord(await rpc('admin_case_ownership_command_v1', command)).replayed,
    true,
  );
  const afterClaim = evidenceRecord(await rpc('get_admin_case_ownership_v1', args));
  assert.equal(afterClaim.assigned_to, staffId);
  assert.equal(afterClaim.revision, 1);
  checks.push(
    'claim committed once, same request replayed, exact business hint delivered through Ably',
  );
  checkpoint('wait-for-real-token-renewal');
  // Passive wait through the original 15-minute token lifetime. No database
  // polling or member traffic; only normal SDK token renewal is permitted.
  const deadline = Math.min(firstTokenExpiry + 2000, Date.now() + 920000);
  while (Date.now() < deadline) {
    await wait(Math.min(30000, deadline - Date.now()));
    console.log(
      JSON.stringify({
        stage,
        remainingSeconds: Math.max(0, Math.ceil((deadline - Date.now()) / 1000)),
        renewals: authCount - initialAuth,
      }),
    );
  }
  assert.ok(authCount > initialAuth, 'SDK did not renew its expiring token');
  assert.equal(c.connection.state, 'connected');
  checks.push('automatic token renewal observed across original token expiry');
  c.close();
  checkpoint('reconnect-and-release');
  const reconnected = await startClient();
  const releaseEvent = eventWait(reconnected);
  releaseEvent.catch(() => {});
  assert.equal(
    evidenceRecord(
      await rpc('admin_case_ownership_command_v1', {
        ...args,
        p_revision: 1,
        p_source_version: String(own.source_version),
        p_action: 'release',
        p_target: null,
        p_request_id: randomUUID(),
      }),
    ).revision,
    2,
  );
  await releaseEvent;
  checks.push('reconnect receives release event and current authorized ownership read');
  assert.equal(evidenceRecord(await rpc('get_admin_case_ownership_v1', args)).assigned_to, null);
  reconnected.close();
  checkpoint('revoke-test-access');
  const clean = await cleanupDatabase();
  assert.equal(clean.history_count, 2);
  const denied = await request('/api/rpc', { name: 'portal_realtime_token_v1', args: {} });
  assert.ok([401, 403].includes(denied.status));
  assert.equal((await request('/api/session')).status, 401);
  checks.push(
    'revoked test employee denied fresh reads and token renewal; only two ownership audit entries',
  );
  passed = true;
} catch (error) {
  // Do not expose upstream bodies, credentials, session cookies or MFA values.
  failure =
    error instanceof Error ? error.message.slice(0, 180) : 'Unknown synthetic check failure';
  console.error(JSON.stringify({ stage, failure }));
} finally {
  client?.close();
  if (!databaseDisabled && subject) {
    try {
      await cleanupDatabase();
    } catch {
      failure += ' | Exact synthetic database cleanup requires inspection';
    }
  }
  if (subject) {
    try {
      await provider(`/user_management/users/${subject}`, 'DELETE');
      providerDeleted = true;
    } catch {
      failure += ' | Exact synthetic provider deletion requires inspection';
    }
  }
  await write('synthetic-acceptance', {
    at: new Date().toISOString(),
    passed,
    cleaned: databaseDisabled && providerDeleted,
    stage,
    failure,
    checks,
    timings,
    httpCount,
    authCount,
    createdDatabase,
    databaseDisabled,
    providerDeleted,
    staffId,
    accountId,
    caseId,
    scope: 'One synthetic business ownership journey; local fixtures cover other case families',
    residualTokenLimit:
      'Already issued identifier-only tokens may last up to the existing 15-minute TTL; fresh reads deny immediately.',
  });
}
assert.ok(
  passed && databaseDisabled && providerDeleted,
  'Synthetic acceptance incomplete; promotion remains gated',
);
console.log(
  'Synthetic live acceptance passed; temporary access removed and labelled audit retained.',
);
