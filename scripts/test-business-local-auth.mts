// Real Auth 2.197.0, restored synthetic schema, no external providers or email.
// Run after start-media-storage-local.mts. Do not point this at another project.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { randomUUID, createHmac, createHash } from 'node:crypto';
import { businessAuth } from '../supabase/functions/_shared/business-auth.ts';
import { createBusinessApplicationClient } from '../website/business-portal/application-client.mts';
import { qualifyBusinessHttpWorkflow } from './test-business-http-workflow.mts';
import type { LocalAuth, LocalStatus } from './test-business-http-workflow.mts';
import {
  evidenceRecord,
  evidenceText,
  evidenceArray,
  evidenceAt,
  evidenceStrings,
} from './release-evidence.mts';
import { errorOutput } from './database/contracts.mts';
const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
const workdir = 'D:/ChallengeApp/DoIt/test-results/media-storage-verify';
const db = 'supabase_db_media-storage-verify';
const container = `doji-business-auth-qa-${Date.now()}`;
const command = (args: string[], input?: string) => {
  try {
    return execFileSync(podman, args, {
      input,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 12000000,
    }).trim();
  } catch (error) {
    // Never print container environment arguments (even synthetic keys).
    throw Error(
      `Local container ${args[0]} failed: ${errorOutput(error, 'stderr')
        .replace(/eyJ[A-Za-z0-9_.-]+/g, '[test token]')
        .slice(-1200)}`,
    );
  }
};
const sql = (input: string) =>
  command(
    [
      'exec',
      '-i',
      db,
      'psql',
      '-X',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-At',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    input,
  );
assert.ok(!existsSync(`${workdir}/supabase/.temp/project-ref`));
assert.match(
  readFileSync(`${workdir}/supabase/config.toml`, 'utf8'),
  /project_id = "media-storage-verify"/,
);
sql(
  `do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic-only database required'; end if; end$$;`,
);
const rawStatus = evidenceRecord(
  JSON.parse(
    execFileSync(
      process.execPath,
      [
        'node_modules/supabase/dist/supabase.js',
        'status',
        '--workdir',
        workdir,
        '--output',
        'json',
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, PATH: `C:/Program Files/RedHat/Podman;${process.env.PATH}` },
      },
    ),
  ),
);
const status: LocalStatus = {
  API_URL: evidenceText(rawStatus.API_URL),
  ANON_KEY: evidenceText(rawStatus.ANON_KEY),
  SERVICE_ROLE_KEY: evidenceText(rawStatus.SERVICE_ROLE_KEY),
};
assert.equal(status.API_URL, 'http://127.0.0.1:54431');
if (sql("select to_regclass('business_private.settings') is null;") === 't') {
  sql(readFileSync('docs/drafts/business_applications_v1.sql', 'utf8'));
  sql(readFileSync('docs/drafts/business_auth_v1.sql', 'utf8'));
} else {
  // Bring only this guarded, synthetic local candidate up to the checked-in draft.
  // Do not replace shared member functions or discard previous test evidence.
  const applicationSource = readFileSync('docs/drafts/business_applications_v1.sql', 'utf8');
  const definitions = [...applicationSource.matchAll(/create function [\s\S]*?\$\$;/g)];
  assert.equal(definitions.length, 11);
  sql(`begin;
    alter table business_private.settings add column if not exists realtime_enabled boolean not null default false;
    ${definitions.map(([definition]) => definition.replace('create function', 'create or replace function')).join('\n')}
    ${applicationSource.slice(applicationSource.indexOf('-- Explicit grants'), applicationSource.lastIndexOf('commit;'))}
    commit;`);
  // Update only the local draft admission function on repeat test runs.
  const source = readFileSync('docs/drafts/business_auth_v1.sql', 'utf8');
  sql(
    source
      .slice(
        source.indexOf('create function public.claim_business_auth_v1'),
        source.indexOf('revoke all on function'),
      )
      .replace('create function', 'create or replace function'),
  );
}
const publicSource = readFileSync('docs/drafts/business_public_admission_v1.sql', 'utf8');
if (sql("select to_regclass('business_private.public_auth_settings') is null;") === 't')
  sql(publicSource);
else
  sql(
    publicSource
      .slice(
        publicSource.indexOf('create function public.claim_public_business_auth_v1'),
        publicSource.indexOf('revoke all on function'),
      )
      .replace('create function', 'create or replace function'),
  );
sql(
  "grant doji_business to authenticator; notify pgrst,'reload schema'; grant usage on schema public to supabase_auth_admin; grant execute on function public.hook_enforce_minimum_signup_age(jsonb) to supabase_auth_admin;",
);
if (sql("select to_regclass('business_private.signup_agreements') is null;") === 't')
  sql(readFileSync('docs/drafts/business_signup_legal_v1.sql', 'utf8'));
else {
  const legalSource = readFileSync('docs/drafts/business_signup_legal_v1.sql', 'utf8');
  sql(`begin;
    ${[...legalSource.matchAll(/create function [\s\S]*?\$\$;/g)].map(([d]) => d.replace('create function', 'create or replace function')).join('\n')}
    drop trigger business_signup_agreement on auth.users;
    ${legalSource.slice(legalSource.indexOf('create constraint trigger'), legalSource.lastIndexOf('commit;'))}
    commit;`);
}
const privacySource = readFileSync('docs/drafts/business_privacy_v1.sql', 'utf8');
if (sql("select to_regclass('business_private.privacy_settings') is null;") === 't')
  sql(privacySource);
else
  sql(`begin;
  alter table business_private.privacy_controls add column if not exists hold_case_id uuid;
  ${[...privacySource.matchAll(/create function [\s\S]*?\$\$;/g)].map(([d]) => d.replace('create function', 'create or replace function')).join('\n')}
  ${privacySource.slice(privacySource.lastIndexOf('revoke all on all functions'), privacySource.lastIndexOf('commit;'))}
  commit;`);
sql("notify pgrst,'reload schema';");
const original = evidenceArray(
  JSON.parse(command(['inspect', 'supabase_auth_media-storage-verify'])),
)[0];
const network = Object.keys(evidenceAt(original, 'NetworkSettings', 'Networks'))[0];
assert.ok(network);
assert.ok(network.includes('media-storage-verify'));
const overrides = {
  API_EXTERNAL_URL: `${status.API_URL}/auth/v1`,
  GOTRUE_API_HOST: '0.0.0.0',
  GOTRUE_API_PORT: '9999',
  GOTRUE_SITE_URL: 'https://business.example.test',
  GOTRUE_URI_ALLOW_LIST: 'https://business.example.test/business-portal/access/',
  GOTRUE_HOOK_BEFORE_USER_CREATED_ENABLED: 'true',
  GOTRUE_HOOK_BEFORE_USER_CREATED_URI:
    'pg-functions://postgres/public/hook_enforce_minimum_signup_age',
  GOTRUE_MAILER_AUTOCONFIRM: 'false',
  GOTRUE_SMTP_HOST: '',
  GOTRUE_MFA_TOTP_ENROLL_ENABLED: 'true',
  GOTRUE_MFA_TOTP_VERIFY_ENABLED: 'true',
};
const environment = evidenceStrings(evidenceAt(original, 'Config').Env).filter(
  (v) => !Object.hasOwn(overrides, evidenceText(v.split('=')[0])),
);
environment.push(...Object.entries(overrides).map(([k, v]) => `${k}=${v}`));
const env = {
  enabled: true,
  origin: 'https://business.example.test',
  supabaseUrl: status.API_URL,
  anonKey: status.ANON_KEY,
  serviceKey: status.SERVICE_ROLE_KEY,
  resendKey: 'intercepted-only',
  fromEmail: 'Doji <business@test.invalid>',
  linkKey: randomUUID(),
  publicAdmission: true,
  turnstileSecret: 'local-intercepted-only',
};
const deliveries: Record<string, unknown>[] = [],
  checks: string[] = [];
let running = false;
const pass = (label: string) => {
  checks.push(label);
  console.log(`PASS: ${label}`);
};
const upstream: typeof fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  if (url === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    const body = evidenceRecord(JSON.parse(evidenceText(init.body)));
    assert.equal(body.secret, 'local-intercepted-only');
    assert.match(evidenceText(body.response), /^local-proof-(register|signin|resend|recover)$/);
    return Response.json({
      success: true,
      hostname: 'business.example.test',
      action: `business_${evidenceText(body.response).slice('local-proof-'.length)}`,
    });
  }
  if (url === 'https://api.resend.com/emails') {
    deliveries.push(evidenceRecord(JSON.parse(evidenceText(init.body))));
    return Response.json({ id: randomUUID() });
  }
  const target = new URL(url);
  assert.equal(target.origin, status.API_URL, 'No non-local service requests');
  if (target.pathname.startsWith('/auth/v1/'))
    return fetch(
      `http://127.0.0.1:54451${target.pathname.slice('/auth/v1'.length)}${target.search}`,
      init,
    );
  return fetch(url, init);
};
const requestAuth = (body: Record<string, unknown>) =>
  businessAuth(
    new Request(env.origin, {
      method: 'POST',
      headers: { origin: env.origin, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...body,
        ...(body.action === 'verify' ? {} : { verificationToken: `local-proof-${body.action}` }),
      }),
    }),
    env,
    upstream,
  );
const auth: LocalAuth = async (path, body, bearer = status.SERVICE_ROLE_KEY, method = 'POST') => {
  const response = await upstream(`${status.API_URL}/auth/v1/${path}`, {
    method,
    headers: {
      apikey: status.ANON_KEY,
      authorization: `Bearer ${bearer}`,
      'content-type': 'application/json',
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = evidenceRecord(await response.json().catch(() => ({})));
  assert.ok(response.ok, `${path.split('?')[0]} HTTP ${response.status} ${data?.error_code || ''}`);
  return data;
};
function totp(secret: string) {
  const bits = [...secret.replace(/=+$/, '')]
    .map((c) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2))),
    counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000)));
  const hash = createHmac('sha1', key).update(counter).digest();
  return String((hash.readUInt32BE(hash.readUInt8(19) & 15) & 0x7fffffff) % 1000000).padStart(
    6,
    '0',
  );
}
const email = `business-${randomUUID()}@test.invalid`,
  password = `Local-${randomUUID()}!`;
let businessBearer: string | undefined;
const clientFetch: typeof fetch = async (input, init = {}) => {
  const url = input instanceof Request ? input.url : String(input);
  const parsed = new URL(url);
  assert.equal(parsed.origin, 'https://business-api.example.test');
  if (parsed.pathname === '/functions/v1/business-auth')
    return requestAuth(evidenceRecord(JSON.parse(evidenceText(init.body))));
  if (parsed.pathname.startsWith('/rest/v1/rpc/'))
    businessBearer = new Headers(init.headers).get('authorization')?.replace(/^Bearer /, '');
  try {
    return await upstream(`${status.API_URL}${parsed.pathname}${parsed.search}`, init);
  } catch (error) {
    throw Error(
      `Local business client ${parsed.pathname.split('/').at(-1)}: ${error instanceof Error ? error.name : 'Unknown error'}`,
    );
  }
};
const client = createBusinessApplicationClient(
  { enabled: true, supabaseUrl: 'https://business-api.example.test', anonKey: status.ANON_KEY },
  clientFetch,
);
const ticket = () => {
  const matched = evidenceText(deliveries.at(-1)?.text).match(
    /https:\/\/business\.example\.test\/business-portal\/access\/#[^\s]+/,
  );
  assert.ok(matched?.[0]);
  return new URL(matched[0]).hash.slice('#ticket='.length);
};
try {
  command([
    'run',
    '--pull=never',
    '-d',
    '--name',
    container,
    '--network',
    network,
    '-p',
    '127.0.0.1:54451:9999',
    ...environment.flatMap((v) => ['-e', v]),
    'docker.io/supabase/gotrue:v2.197.0',
  ]);
  running = true;
  let health;
  for (let i = 0; i < 30; i++) {
    try {
      health = await (await fetch('http://127.0.0.1:54451/health')).json();
      break;
    } catch {
      await new Promise((r) => {
        setTimeout(r, 250);
      });
    }
  }
  assert.equal(health?.version, 'v2.197.0');
  pass('exact Auth 2.197.0 is running on loopback only');
  const missingDob = await upstream(`${status.API_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: status.ANON_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email: `missing-${randomUUID()}@test.invalid`, password }),
  });
  assert.equal(missingDob.status, 400);
  assert.match(await missingDob.text(), /birthday/);
  pass('unchanged member signup hook rejects missing birthday');
  const member = await auth('admin/users', {
    email: `member-${randomUUID()}@test.invalid`,
    password,
    email_confirm: true,
    user_metadata: { birth_date: '2000-01-01' },
  });
  const memberSession = await auth(
    'token?grant_type=password',
    { email: member.email, password },
    status.ANON_KEY,
  );
  sql(
    `update business_private.settings set enabled=true,application_terms_version='test-terms-v1',privacy_version='test-privacy-v1';
     update business_private.auth_settings set enabled=false,allowed_emails='{}';
     update business_private.public_auth_settings set enabled=true,registration_open=true,admission_until=clock_timestamp()+interval '1 hour',registration_limit=25,email_limit=250,daily_email_limit=50,registrations_used=0,emails_used=0,daily_emails_used=0,attempts=0;
     update business_private.public_auth_buckets set attempts=0,last_mail_at=null;`,
  );
  assert.equal(
    (await requestAuth({ action: 'signin', email: member.email, password })).status,
    401,
  );
  pass('business password endpoint refuses real member identity');
  let response = await requestAuth({
    action: 'register',
    email,
    password,
    displayName: 'Synthetic business owner',
    country: 'US',
    termsAccepted: true,
    privacyAcknowledged: true,
    termsVersion: 'test-terms-v1',
    privacyVersion: 'test-privacy-v1',
  });
  assert.equal(response.status, 202, await response.text());
  assert.equal(deliveries.length, 1);
  pass(
    'public registration without an invitation creates unconfirmed custom-role identity and intercepted branded email',
  );
  assert.equal((await requestAuth({ action: 'signin', email, password })).status, 401);
  pass('unconfirmed business cannot sign in');
  sql('update business_private.public_auth_buckets set last_mail_at=null;');
  assert.equal((await requestAuth({ action: 'resend', email })).status, 202);
  assert.equal(deliveries.length, 2);
  pass('bounded verification resend generates a usable real Auth link');
  const originalTicket = ticket();
  assert.equal(await client.verifyLink(originalTicket), 'signup');
  await client.signout();
  assert.equal((await requestAuth({ action: 'verify', ticket: originalTicket })).status, 400);
  pass('explicit signed verification succeeds once; replay fails');
  await client.signin({ email, password });
  const id = sql(`select id from auth.users where email='${email}';`);
  assert.equal(
    sql(
      `select terms_version||'|'||privacy_version from business_private.signup_agreements where account_id='${id}';`,
    ),
    'test-terms-v1|test-privacy-v1',
  );
  pass('real Auth account creation atomically records exact signup agreement versions');
  assert.equal(sql(`select count(*) from public.profiles where id='${id}';`), '0');
  pass('business identity has no member profile or invented birthday');
  await assert.rejects(client.workspace()); // feature remains disabled; no workspace privilege
  await client.signin({ email, password });
  const factor = await client.enroll();
  assert.ok(factor.totp);
  await client.verifyFactor(factor.id, totp(evidenceText(factor.totp.secret)));
  assert.equal(client.assurance(), 'aal2');
  pass('real TOTP enrollment and challenge elevate separate business JWT to AAL2');
  const httpEvidence = await qualifyBusinessHttpWorkflow({
    client,
    auth,
    upstream,
    status,
    sql,
    pass,
    password,
    memberSession,
    totp,
    bearer: () => businessBearer,
  });
  await client.signout();
  sql('update business_private.public_auth_buckets set last_mail_at=null;');
  response = await requestAuth({ action: 'recover', email });
  assert.equal(response.status, 202);
  assert.equal(deliveries.length, 3);
  assert.equal(await client.verifyLink(ticket()), 'recovery');
  await assert.rejects(client.resetPassword(`Next-${randomUUID()}`), /authenticator/);
  pass('password recovery cannot bypass an existing authenticator');
  // Wait only if still inside the same TOTP time step to avoid replay rejection.
  const boundary = 30000 - (Date.now() % 30000) + 100;
  await new Promise((r) => {
    setTimeout(r, boundary);
  });
  await client.verifyFactor(factor.id, totp(evidenceText(factor.totp.secret)));
  const replacement = `Replacement-${randomUUID()}!`;
  await client.resetPassword(replacement);
  await client.signout();
  assert.equal((await requestAuth({ action: 'signin', email, password })).status, 401);
  await client.signin({ email, password: replacement });
  assert.ok((await client.factors()).some((f) => f.status === 'verified'));
  await client.signout();
  pass('recovery changes password and retains verified MFA');
  const memberRefresh = await auth(
    'token?grant_type=refresh_token',
    { refresh_token: memberSession.refresh_token },
    status.ANON_KEY,
  );
  assert.equal(evidenceRecord(memberRefresh.user).id, member.id);
  pass('member session survives business registration, recovery, MFA and local logout');
  mkdirSync('test-results/business-auth-20260929', { recursive: true });
  writeFileSync(
    'test-results/business-auth-20260929/result.json',
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        authVersion: health.version,
        checks,
        externalEmailSent: false,
        productionChanged: false,
        applicationHttpQualified: true,
        httpEvidence,
        postgrestImage: JSON.parse(command(['inspect', 'supabase_rest_media-storage-verify']))[0]
          .Config.Image,
        businessRealtimeEnabled: false,
        publicAdmission: true,
        turnstileValidation: 'intercepted locally; real provider/hostname not qualified',
        sourceSha256: Object.fromEntries(
          [
            'docs/drafts/business_applications_v1.sql',
            'docs/drafts/business_auth_v1.sql',
            'docs/drafts/business_public_admission_v1.sql',
            'docs/drafts/business_signup_legal_v1.sql',
            'docs/drafts/business_privacy_v1.sql',
            'supabase/functions/_shared/business-erasure.ts',
            'supabase/functions/_shared/business-auth.ts',
            'website/business-portal/application-client.mts',
          ].map((path) => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]),
        ),
        scope:
          'Synthetic local Auth and existing restored public schema; no hosted configuration qualification',
      },
      null,
      2,
    ),
  );
} finally {
  client.clear();
  sql(
    'update business_private.auth_settings set enabled=false; update business_private.public_auth_settings set enabled=false,registration_open=false; update business_private.settings set enabled=false,realtime_enabled=false; update business_private.privacy_settings set enabled=false;',
  );
  if (running) command(['stop', container]); // Retain the exact test container for diagnostics; no volume removal.
}
console.log(
  `${checks.length} real local business Auth checks passed. No external email or production action.`,
);
