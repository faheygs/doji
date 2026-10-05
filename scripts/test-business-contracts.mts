// Synthetic, offline checks against the actual typed boundary modules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  businessStates,
  isBusinessApplication,
  errorStatus,
} from '../infra/portal-identity-candidate/business-contracts.mts';
import type {
  BusinessState,
  BusinessCommand,
} from '../infra/portal-identity-candidate/business-contracts.mts';
import { createBusinessBrowserClient } from '../infra/portal-identity-candidate/business-browser-client.mts';
import { createBusinessApplicationAdapter } from '../infra/portal-identity-candidate/business-application-adapter.mts';
import { createWorkosBusinessProvider } from '../infra/portal-identity-candidate/workos-business-provider.mts';
import {
  createBusinessCipher,
  equal,
  isVerifiedBusinessActor,
  loginFlow,
  savedSession,
} from '../infra/portal-identity-candidate/business-http-state.mts';

const config = {
  enabled: true,
  realm: 'business' as const,
  origin: 'https://business.example.test',
};
const application = { id: 'synthetic-application', revision: 1, state: 'draft', details: {} };
const session = { signedIn: true, csrf: 'a'.repeat(43), assurance: 'aal1' };
const actor = {
  realm: 'business',
  issuer: 'https://api.workos.com/user_management/client_test',
  audience: 'client_test',
  subject: 'user_test',
  sessionId: 'session_test',
  mfaVerified: false,
};
const verifiedActor = { ...actor, realm: 'business' as const, expiresAtSeconds: 2000000000 };
const flow = {
  binding: 'ab'.repeat(32),
  verifier: 'v'.repeat(43),
  agreements: null,
  expires: 2000000000,
};
const saved = {
  tokens: {
    subject: 'user_test',
    accessToken: 'synthetic-access',
    refreshToken: 'synthetic-refresh',
  },
  actor: verifiedActor,
  csrf: 'c'.repeat(43),
  created: 1,
  touched: 2,
};

test('sealed state retains origin/directory/key binding and rejects tampering', () => {
  const cipher = createBusinessCipher(config.origin, 'client_test', 'ab'.repeat(32));
  const encrypted = cipher.seal(saved);
  assert.deepEqual(savedSession(cipher.open(encrypted)), saved);
  for (const other of [
    createBusinessCipher('https://other.test', 'client_test', 'ab'.repeat(32)),
    createBusinessCipher(config.origin, 'client_other', 'ab'.repeat(32)),
    createBusinessCipher(config.origin, 'client_test', 'cd'.repeat(32)),
  ])
    assert.throws(() => other.open(encrypted));
  for (const value of ['', 'a'.repeat(50001), encrypted.slice(1)])
    assert.throws(() => cipher.open(value));
});
test('cookie comparison rejects unequal byte lengths without an exception', () => {
  for (const [a, b] of [
    [null, 'a'],
    ['a', null],
    ['é', 'a'],
    ['abc', 'xyz'],
    ['', 'a'],
  ])
    assert.equal(equal(a, b), false);
  assert.equal(equal('same', 'same'), true);
});
test('verified actor shape rejects invalid directory/session/expiry values', () => {
  assert.equal(isVerifiedBusinessActor(verifiedActor), true);
  for (const value of [
    null,
    [],
    { ...verifiedActor, realm: 'employee' },
    ...Object.entries({
      subject: [1, 'bad'],
      sessionId: [1, 'bad'],
      audience: [1, 'bad'],
      issuer: ['https://evil.test'],
      mfaVerified: [1],
      expiresAtSeconds: ['1', NaN, Infinity],
    }).flatMap(([key, values]) => values.map((value) => ({ ...verifiedActor, [key]: value }))),
  ]) {
    assert.equal(isVerifiedBusinessActor(value), false);
  }
});
test('decrypted login flows reject malformed state and agreement shapes', () => {
  assert.deepEqual(loginFlow(flow), flow);
  const agreements = {
    termsAccepted: true,
    privacyAcknowledged: true,
    country: 'US',
    termsVersion: 'v1',
    privacyVersion: 'v1',
  };
  assert.deepEqual(loginFlow({ ...flow, agreements }).agreements, agreements);
  for (const value of [
    null,
    [],
    { ...flow, binding: 1 },
    { ...flow, binding: 'bad' },
    { ...flow, verifier: 'bad' },
    { ...flow, expires: Infinity },
    ...[
      null,
      false,
      {},
      { ...agreements, termsAccepted: false },
      { ...agreements, privacyAcknowledged: false },
      { ...agreements, country: 'CA' },
      { ...agreements, termsVersion: 1 },
      { ...agreements, privacyVersion: 1 },
    ]
      .filter((value) => value !== null)
      .map((agreements) => ({ ...flow, agreements })),
  ]) {
    assert.throws(() => loginFlow(value), { status: 401 });
  }
});
test('decrypted sessions cannot replace structural runtime validation with a type assertion', () => {
  assert.deepEqual(savedSession(saved), saved);
  for (const value of [
    null,
    [],
    { ...saved, actor: {} },
    { ...saved, csrf: 'bad' },
    { ...saved, created: '1' },
    { ...saved, touched: NaN },
    ...[
      null,
      {},
      { ...saved.tokens, subject: 1 },
      { ...saved.tokens, accessToken: 1 },
      { ...saved.tokens, refreshToken: 1 },
    ].map((tokens) => ({ ...saved, tokens })),
  ]) {
    assert.throws(() => savedSession(value), { status: 401 });
  }
});
const command: BusinessCommand = {
  p_action: 'save',
  p_revision: null,
  p_details: {},
  p_terms_version: null,
  p_privacy_version: null,
  p_request_id: '87000000-0000-4000-8000-000000000001',
};

test('the typed states match the database constraint exactly', () => {
  const sql = readFileSync(
    new URL('../docs/drafts/business_applications_v1.sql', import.meta.url),
    'utf8',
  );
  const states = /state text not null default 'draft' check\(state in \(([^)]+)\)\)/.exec(sql)?.[1];
  assert.ok(states, 'Database state constraint changed; review the shared contract');
  assert.deepEqual(states.replaceAll("'", '').split(','), [...businessStates]);
});
for (const state of businessStates) {
  test(`browser accepts the actual ${state} application in reads and receipts`, async () => {
    const value = { ...application, state };
    const client = createBusinessBrowserClient(config, async (url, options) =>
      Response.json(
        url.endsWith('/session')
          ? session
          : options.method === 'GET'
            ? value
            : { application: value },
      ),
    );
    await client.restore();
    assert.deepEqual(await client.read(), value);
    assert.deepEqual(await client.command(command), { application: value });
  });
}
for (const value of [
  undefined,
  null,
  true,
  42,
  [],
  {},
  { ...application, state: 'rejected' },
  { ...application, state: 'withdrawn' },
  { ...application, revision: '1' },
  { ...application, revision: 1.5 },
  { ...application, details: null },
])
  test(`application boundary rejects ${JSON.stringify(value)}`, () =>
    assert.equal(isBusinessApplication(value), false));

test('error status accepts only numeric status on objects', () => {
  for (const value of [null, undefined, 401, '401', [], { status: '401' }])
    assert.equal(errorStatus(value), undefined);
  assert.equal(errorStatus(Object.assign(Error('synthetic'), { status: 401 })), 401);
});
test('browser malformed redirect and primitive transport failures fail closed', async () => {
  for (const result of [null, [], {}, { authorizationUrl: 7 }]) {
    const client = createBusinessBrowserClient(config, async () => Response.json(result));
    await assert.rejects(client.signin());
    assert.equal(client.hasSession(), false);
  }
  const client = createBusinessBrowserClient(config, async () => {
    throw null;
  });
  await assert.rejects(client.restore(), (value: unknown) => value === null);
  assert.equal(client.hasSession(), false);
});
test('SQL adapter rejects malformed identity and command before executing', () => {
  let calls = 0;
  const adapter = createBusinessApplicationAdapter(async () => {
    calls++;
    return null;
  });
  for (const value of [
    null,
    [],
    { ...actor, subject: 1 },
    { ...actor, sessionId: false },
    { ...actor, audience: null },
    { ...actor, issuer: 'https://evil.test' },
    { ...actor, mfaVerified: 1 },
  ])
    assert.throws(() => adapter.read(value), { status: 403 });
  for (const input of [
    null,
    [],
    { ...command, p_action: 'approve' },
    { ...command, p_revision: '1' },
    { ...command, p_revision: -1 },
    { ...command, p_details: [] },
    { ...command, p_details: { large: 'a'.repeat(12001) } },
    { ...command, p_terms_version: {} },
    { ...command, p_privacy_version: '' },
    { ...command, p_request_id: 1 },
    { ...command, p_request_id: 'bad' },
    { ...command, injected: true },
    Object.fromEntries(Object.entries(command).filter(([key]) => key !== 'p_revision')),
  ])
    assert.throws(() => adapter.command(actor, input), { status: 400 });
  assert.equal(calls, 0);
});
test('SQL adapter maps only known own codes and scrubs all other failures', async () => {
  for (const code of ['42501', '22023', 'PT409', '55000', 'constructor', 'toString', 42501, null]) {
    const adapter = createBusinessApplicationAdapter(async () => {
      throw { code, message: 'PRIVATE' };
    });
    const expected =
      code === '42501'
        ? 403
        : code === '22023'
          ? 400
          : code === 'PT409' || code === '55000'
            ? 409
            : 503;
    await assert.rejects(
      adapter.authorize(actor),
      (value: unknown) =>
        value instanceof Error &&
        errorStatus(value) === expected &&
        !value.message.includes('PRIVATE'),
    );
  }
  const adapter = createBusinessApplicationAdapter(async () => {
    throw null;
  });
  await assert.rejects(adapter.read(actor), { status: 503 });
});
test('SQL adapter preserves valid revisions and versioned legal fields', async () => {
  const adapter = createBusinessApplicationAdapter(async (role, sql, parameters) => {
    assert.equal(role, 'doji_identity_resolver');
    assert.equal(parameters[6], 2);
    assert.equal(parameters[8], 'terms-v1');
    assert.ok(sql.includes('business_application_command('));
    return { application };
  });
  assert.deepEqual(
    await adapter.command(actor, {
      ...command,
      p_revision: 2,
      p_terms_version: 'terms-v1',
      p_privacy_version: 'privacy-v1',
    }),
    { application },
  );
});
test('provider rejects primitive response bodies without accepting credentials', async () => {
  for (const value of [null, [], false, { user: { email_verified: true, id: 5 } }]) {
    const provider = createWorkosBusinessProvider(
      { clientId: 'client_test', apiKey: 'sk_' + 'x'.repeat(32) },
      async () => Response.json(value),
    );
    await assert.rejects(
      provider.exchange('synthetic', 'verifier', AbortSignal.timeout(1000)),
      /Business authentication unavailable/,
    );
  }
});

// Compile-time contract controls, not executed or a source of coverage credit.
function typeControls(): void {
  // @ts-expect-error Database business state is declined, not rejected.
  const state: BusinessState = 'rejected';
  // @ts-expect-error A revision must be numeric, not a JSON string.
  const badCommand: BusinessCommand = { ...command, p_revision: '2' };
  void state;
  void badCommand;
}
void typeControls;
