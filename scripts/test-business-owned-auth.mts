// Offline only: fake provider/store. No keys, DB, emails or production traffic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { BusinessPasswordRejected } from '../infra/portal-identity/business-password-policy.mts';
import {
  createBusinessOwnedProvider,
  OwnedCodeRejected,
  type OwnedGrant,
} from '../infra/portal-identity/business-owned-provider.mts';
import {
  createBusinessOwnedFlow,
  type OwnedFlowDependencies,
} from '../infra/portal-identity/business-owned-flow.mts';
const policy = {
  enabled: true,
  sendingEnabled: true,
  customResetEmailEnabled: true,
  realm: 'business' as const,
  origin: 'https://business.dojipro.com',
  clientId: 'client_business',
  apiKey: 'sk_' + 'x'.repeat(24),
  encryptionKey: 'ab'.repeat(32),
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
};
const signal = () => new AbortController().signal;
const tokens = {
  subject: 'user_business',
  accessToken: 'private-access',
  refreshToken: 'private-refresh',
};
const agreement = {
  termsAccepted: true,
  privacyAcknowledged: true,
  country: 'US',
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
};
const binding = 'b'.repeat(43);
function providerFixture(body: unknown, status = 200, overrides = {}) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  const provider = createBusinessOwnedProvider({ ...policy, ...overrides }, async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify(body), { status });
  });
  return { provider, requests };
}
test('provider gates prevent all requests while disabled or sending gated', async () => {
  for (const overrides of [{ enabled: false }, { sendingEnabled: false }]) {
    const { provider, requests } = providerFixture({}, 200, overrides);
    await assert.rejects(provider.password('test@example.com', 'not-a-real-password', signal()));
    await assert.rejects(provider.create('test@example.com', 'not-a-real-password', signal()));
    await assert.rejects(provider.recover('test@example.com', signal()));
    assert.equal(requests.length, 0);
  }
});
test('password uses only pinned business credentials and projects minimal server grant', async () => {
  const { provider, requests } = providerFixture({
    user: { id: tokens.subject, email_verified: true, email: 'private@example.com' },
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  });
  assert.deepEqual(await provider.password('test@example.com', 'sample-password', signal()), {
    kind: 'verified',
    tokens,
  });
  assert.equal(requests[0]?.url, 'https://api.workos.com/user_management/authenticate');
  assert.equal(requests[0]?.body.client_id, policy.clientId);
  assert.equal(requests[0]?.body.grant_type, 'password');
});
test('unverified, impersonated, organization and malformed responses never authenticate', async () => {
  const valid = {
    user: { id: tokens.subject, email_verified: true },
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
  };
  for (const body of [
    { ...valid, user: { id: tokens.subject, email_verified: false } },
    { ...valid, impersonator: {} },
    { ...valid, organization_id: 'org_other' },
    { code: 'mfa_challenge', pending_authentication_token: 'secret' },
    { access_token: 'leak' },
  ]) {
    await assert.rejects(
      providerFixture(body).provider.password('test@example.com', 'sample-password', signal()),
      (error) => error instanceof Error && !error.message.includes('leak'),
    );
  }
});
test('email challenge is not a session and verification uses the documented grant', async () => {
  const challenge = providerFixture(
    { code: 'email_verification_required', pending_authentication_token: 'pending-secret' },
    403,
  );
  assert.deepEqual(
    await challenge.provider.password('test@example.com', 'sample-password', signal()),
    { kind: 'email', pendingToken: 'pending-secret' },
  );
  await challenge.provider.verify('pending-secret', '123456', signal());
  assert.equal(
    challenge.requests[1]?.body.grant_type,
    'urn:workos:oauth:grant-type:email-verification:code',
  );
});
test('creation cannot mark an email verified; reset never returns provider token or URL', async () => {
  const fixture = providerFixture({ id: 'user_business', email_verified: false }, 201);
  await fixture.provider.create('test@example.com', 'sample-password', signal());
  assert.equal(fixture.requests[0]?.body.email_verified, false);
  const recovery = providerFixture({}, 404);
  assert.equal(await recovery.provider.recover('test@example.com', signal(), async () => {}), null);
});

test('create maps only explicit provider password-policy rejection, never raw details or retries', async () => {
  for (const code of ['password_strength_error', 'password_contains_email']) {
    const { provider, requests } = providerFixture(
      { code, message: 'private provider detail', errors: [{ message: 'private nested detail' }] },
      400,
    );
    await assert.rejects(
      provider.create('sample@example.com', 'synthetic-password', signal()),
      (error) => error instanceof BusinessPasswordRejected && !error.message.includes('private'),
    );
    assert.equal(requests.length, 1);
  }
  for (const [status, data] of [
    [503, { code: 'password_strength_error' }],
    [429, { code: 'password_strength_error' }],
    [400, { code: 'user_creation_error', message: 'password_strength_error' }],
    [400, { code: 'password_strength_error', id: 'user_uncertain' }],
    [400, { code: 'password_strength_error', access_token: 'private' }],
    [201, { code: 'password_strength_error' }],
  ] as const) {
    const { provider, requests } = providerFixture(data, status);
    await assert.rejects(
      provider.create('sample@example.com', 'synthetic-password', signal()),
      (error) =>
        error instanceof Error &&
        !(error instanceof BusinessPasswordRejected) &&
        !error.message.includes('private'),
    );
    assert.equal(requests.length, 1);
  }
});
function flowFixture(overrides = {}) {
  let time = 1000000,
    installs = 0,
    creations = 0,
    verifications = 0;
  const admissions: { action: string; identityKey: string; ticket: string }[] = [];
  const installedTickets: string[] = [];
  const flows = new Map<string, string>();
  const fixtureProvider: {
    -readonly [K in keyof OwnedFlowDependencies['provider']]: OwnedFlowDependencies['provider'][K];
  } = {
    password: async (): Promise<OwnedGrant> => ({ kind: 'email', pendingToken: 'provider-secret' }),
    create: async () => {
      creations++;
      return tokens.subject;
    },
    verify: async (): Promise<OwnedGrant> => {
      verifications++;
      return { kind: 'verified' as const, tokens };
    },
    mfa: async (): Promise<OwnedGrant> => ({ kind: 'verified', tokens }),
    recover: async () => null,
    reset: async () => tokens.subject,
  };
  const deps: OwnedFlowDependencies = {
    provider: fixtureProvider,
    store: {
      putFlow: async (key, value) => {
        flows.set(key, value);
      },
      consumeFlow: async (key, accept) => {
        const v = flows.get(key);
        if (!v || !accept(v)) return null;
        flows.delete(key);
        return v;
      },
    },
    now: () => time,
    verifyProof: async () => true,
    rememberReset: async () => {},
    recoveryEmail: { assertReady: () => {}, send: async () => {} },
    reserveRecoveryEmail: async () => true,
    trustedClientIp: '192.0.2.1',
    guard: {
      identityKey: () => 'a'.repeat(64),
      admit: async (action, identityKey) => {
        const ticket = (admissions.length + 1).toString(16).padStart(64, '0');
        admissions.push({ action, identityKey, ticket });
        return ticket;
      },
    },
    reserve: async () => true,
    install: async (_, consent, ticket) => {
      installs++;
      installedTickets.push(ticket);
      assert.deepEqual(consent, agreement);
    },
  };
  const flow = createBusinessOwnedFlow({ ...policy, ...overrides }, deps);
  return {
    flow,
    flows,
    fixtureProvider,
    deps,
    admissions,
    installedTickets,
    counts: () => ({ installs, creations, verifications }),
    advance: (ms = 300001) => {
      time += ms;
    },
  };
}
const signup = {
  signup: true,
  email: 'test@example.com',
  password: 'sample-password',
  agreement,
  proof: 'offline',
};
test('disabled service and invalid agreements cause no provider side effect', async () => {
  const f = flowFixture({ enabled: false });
  await assert.rejects(f.flow.start(signup, binding, signal()));
  const g = flowFixture();
  await assert.rejects(
    g.flow.start(
      { ...signup, agreement: { ...agreement, termsAccepted: false } },
      binding,
      signal(),
    ),
  );
  assert.equal(f.counts().creations + g.counts().creations, 0);
});

test('explicit code rejection rotates the handle without losing consent or allowing replay', async () => {
  const f = flowFixture();
  const first = await f.flow.start(signup, binding, signal());
  assert.ok(first.handle);
  const verify = f.fixtureProvider.verify;
  f.fixtureProvider.verify = async () => {
    throw new OwnedCodeRejected();
  };
  const retry = await f.flow.verify(first.handle, binding, '000000', 'offline', signal());
  assert.ok(retry.handle && 'codeRejected' in retry);
  assert.notEqual(retry.handle, first.handle);
  assert.equal(f.counts().installs, 0);
  await assert.rejects(f.flow.verify(first.handle, binding, '123456', 'offline', signal()));
  f.fixtureProvider.verify = verify;
  assert.deepEqual(await f.flow.verify(retry.handle, binding, '123456', 'offline', signal()), {
    step: 'complete',
  });
  assert.equal(f.counts().creations, 1);
});

test('five attempts exhaust a flow; retries never extend the original deadline', async () => {
  const f = flowFixture();
  let next = await f.flow.start(signup, binding, signal());
  f.fixtureProvider.verify = async () => {
    throw new OwnedCodeRejected();
  };
  for (let i = 0; i < 4; i++) {
    assert.ok(next.handle);
    next = await f.flow.verify(next.handle, binding, '000000', 'offline', signal());
  }
  assert.ok(next.handle);
  await assert.rejects(f.flow.verify(next.handle, binding, '000000', 'offline', signal()));
  assert.equal(f.flows.size, 0);
  const g = flowFixture();
  const first = await g.flow.start(signup, binding, signal());
  assert.ok(first.handle);
  g.advance(290000);
  g.fixtureProvider.verify = async () => {
    throw new OwnedCodeRejected();
  };
  const retry = await g.flow.verify(first.handle, binding, '000000', 'offline', signal());
  assert.ok(retry.handle);
  g.advance(10001);
  await assert.rejects(g.flow.verify(retry.handle, binding, '000000', 'offline', signal()));
});

test('ambiguous failures and successful responses after expiry cannot restore or install a session', async () => {
  for (const expiredSuccess of [false, true]) {
    const f = flowFixture();
    const next = await f.flow.start(signup, binding, signal());
    assert.ok(next.handle);
    f.fixtureProvider.verify = async () => {
      if (!expiredSuccess) throw Error('network timeout');
      f.advance();
      return { kind: 'verified', tokens };
    };
    await assert.rejects(f.flow.verify(next.handle, binding, '123456', 'offline', signal()));
    assert.equal(f.flows.size + f.counts().installs, 0);
  }
});

test('MFA continuation binds subject, browser, action and deadline; does not install early', async () => {
  for (const wrongSubject of [false, true]) {
    const f = flowFixture();
    f.fixtureProvider.password = async () => ({
      kind: 'mfa',
      pendingToken: 'private-pending',
      subject: tokens.subject,
      challengeId: 'auth_challenge_test',
      expires: 1300000,
    });
    const next = await f.flow.start(signup, binding, signal());
    assert.equal(next.step, 'mfa');
    assert.ok('handle' in next);
    assert.equal(f.counts().installs, 0);
    await assert.rejects(f.flow.verify(next.handle, binding, '123456', 'offline', signal()));
    await assert.rejects(
      f.flow.verify(next.handle, 'c'.repeat(43), '123456', 'offline', signal(), 'mfa'),
    );
    f.fixtureProvider.mfa = async () => ({
      kind: 'verified',
      tokens: { ...tokens, subject: wrongSubject ? 'user_other' : tokens.subject },
    });
    const attempt = f.flow.verify(next.handle, binding, '123456', 'offline', signal(), 'mfa');
    if (wrongSubject) await assert.rejects(attempt);
    else assert.deepEqual(await attempt, { step: 'complete' });
    assert.equal(f.counts().installs, wrongSubject ? 0 : 1);
  }
});

test('provider prepares only verified-user TOTP challenges and validates factor binding', async () => {
  for (const mismatch of [false, true]) {
    const calls: Record<string, unknown>[] = [];
    const provider = createBusinessOwnedProvider(policy, async (url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      if (String(url).endsWith('/authenticate'))
        return new Response(
          JSON.stringify({
            code: 'mfa_challenge',
            pending_authentication_token: 'pending',
            user: { id: tokens.subject, email_verified: true },
            authentication_factors: [{ id: 'auth_factor_test', type: 'totp' }],
          }),
          { status: 403 },
        );
      assert.equal(String(url), 'https://api.workos.com/auth/factors/auth_factor_test/challenge');
      return new Response(
        JSON.stringify({
          id: 'auth_challenge_test',
          authentication_factor_id: mismatch ? 'auth_factor_other' : 'auth_factor_test',
          expires_at: new Date(Date.now() + 300000).toISOString(),
        }),
        { status: 201 },
      );
    });
    const result = provider.password('sample@example.com', 'password', signal());
    if (mismatch) await assert.rejects(result);
    else assert.equal((await result).kind, 'mfa');
    assert.equal(calls.length, 2);
  }
});

test('only explicit code 401 rejection is retryable, never password, timeout or mixed tokens', async () => {
  const f = providerFixture({ code: 'authentication_failed', message: 'private detail' }, 401);
  await assert.rejects(f.provider.verify('pending', '123456', signal()), OwnedCodeRejected);
  await assert.rejects(
    f.provider.mfa('pending', 'auth_challenge_test', '123456', signal()),
    OwnedCodeRejected,
  );
  assert.equal(f.requests[1]?.body.grant_type, 'urn:workos:oauth:grant-type:mfa-totp');
  await assert.rejects(
    f.provider.password('sample@example.com', 'password', signal()),
    (e) => e instanceof Error && !(e instanceof OwnedCodeRejected),
  );
  for (const status of [400, 403, 429, 500]) {
    await assert.rejects(
      providerFixture({ code: 'authentication_failed' }, status).provider.verify(
        'pending',
        '123456',
        signal(),
      ),
      (e) => e instanceof Error && !(e instanceof OwnedCodeRejected),
    );
  }
  await assert.rejects(
    providerFixture({ code: 'authentication_failed', access_token: 'secret' }, 401).provider.verify(
      'pending',
      '123456',
      signal(),
    ),
    (e) => e instanceof Error && !(e instanceof OwnedCodeRejected),
  );
});
test('verification state is encrypted, browser-bound and one-use under concurrency', async () => {
  const f = flowFixture();
  const next = await f.flow.start(signup, binding, signal());
  assert.equal(next.step, 'verify');
  assert.ok('handle' in next);
  assert.ok(!JSON.stringify([...f.flows.values()]).includes('provider-secret'));
  await assert.rejects(f.flow.verify(next.handle, 'c'.repeat(43), '123456', 'offline', signal()));
  const results = await Promise.allSettled([
    f.flow.verify(next.handle, binding, '123456', 'offline', signal()),
    f.flow.verify(next.handle, binding, '123456', 'offline', signal()),
  ]);
  assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(f.counts().installs, 1);
  assert.equal(f.counts().verifications, 1);
});
test('expiry denies provider verification and enrollment', async () => {
  const f = flowFixture();
  const next = await f.flow.start(signup, binding, signal());
  assert.ok('handle' in next);
  f.advance();
  await assert.rejects(f.flow.verify(next.handle!, binding, '123456', 'offline', signal()));
  assert.equal(f.counts().installs + f.counts().verifications, 0);
});
test('a different verified account cannot consume signup consent', async () => {
  const f = flowFixture();
  const next = await f.flow.start(signup, binding, signal());
  assert.ok('handle' in next);
  f.fixtureProvider.verify = async () => ({
    kind: 'verified',
    tokens: { ...tokens, subject: 'user_other' },
  });
  await assert.rejects(f.flow.verify(next.handle!, binding, '123456', 'offline', signal()));
  assert.equal(f.counts().installs, 0);
});
test('recovery is neutral and unsafe post-provider reset entry point is absent', async () => {
  const f = flowFixture();
  f.fixtureProvider.recover = async () => {
    throw Error('user does not exist: private@example.com');
  };
  assert.deepEqual(await f.flow.recover('test@example.com', 'offline', signal()), {
    step: 'check-email',
  });
  assert.equal('reset' in f.flow, false);
  assert.equal(f.admissions[0]?.action, 'recover');
  assert.equal(f.counts().installs, 0);
});

test('recovery persists minimal provider metadata without changing the neutral response', async () => {
  for (const storageFailure of [false, true]) {
    const f = flowFixture();
    const metadata = {
      resetId: 'password_reset_test',
      subject: tokens.subject,
      tokenHash: 'f'.repeat(64),
      expires: 1300000,
    };
    let writes = 0;
    let sends = 0;
    f.fixtureProvider.recover = async (_email, _signal, deliver) => {
      await deliver!(metadata, 'synthetic-reset-token-123456');
      return metadata;
    };
    f.deps.recoveryEmail = {
      assertReady: () => {},
      send: async () => {
        sends++;
        assert.equal(writes, 1);
      },
    };
    f.deps.rememberReset = async (value, identity, abort) => {
      writes++;
      assert.deepEqual(value, metadata);
      assert.equal(identity, 'a'.repeat(64));
      assert.equal(abort.aborted, false);
      if (storageFailure) throw Error('private database error');
    };
    assert.deepEqual(await f.flow.recover('test@example.com', 'offline', signal()), {
      step: 'check-email',
    });
    assert.equal(writes, 1);
    assert.equal(sends, storageFailure ? 0 : 1);
  }
});

test('recovery policy and budget failure stop before WorkOS and stay neutral', async () => {
  for (const failure of ['missing', 'unqualified', 'limited', 'unknown', 'send'] as const) {
    const f = flowFixture();
    let calls = 0,
      sends = 0;
    f.fixtureProvider.recover = async (_email, _abort, deliver) => {
      calls++;
      await deliver!(
        {
          resetId: 'password_reset_test',
          subject: tokens.subject,
          tokenHash: 'f'.repeat(64),
          expires: 1300000,
        },
        'synthetic-reset-token-123456',
      );
      return null;
    };
    if (failure === 'missing') f.deps.recoveryEmail = undefined;
    if (failure === 'unqualified')
      f.deps.recoveryEmail = {
        assertReady: () => {
          throw Error('not qualified');
        },
        send: async () => {},
      };
    if (failure === 'limited') f.deps.reserveRecoveryEmail = async () => false;
    if (failure === 'unknown')
      f.deps.reserveRecoveryEmail = async () => {
        throw Error('lost commit response');
      };
    if (failure === 'send')
      f.deps.recoveryEmail = {
        assertReady: () => {},
        send: async () => {
          sends++;
          throw Error('private provider error');
        },
      };
    assert.deepEqual(await f.flow.recover('test@example.com', 'offline', signal()), {
      step: 'check-email',
    });
    assert.equal(calls, failure === 'send' ? 1 : 0);
    assert.equal(sends, failure === 'send' ? 1 : 0);
  }
});

test('email and MFA retries charge the original identity but install only the ORIGINAL ticket', async () => {
  const f = flowFixture();
  let next = await f.flow.start(signup, binding, signal());
  f.fixtureProvider.verify = async () => ({
    kind: 'mfa',
    pendingToken: 'next-private-token',
    subject: tokens.subject,
    challengeId: 'auth_challenge_test',
    expires: 1300000,
  });
  assert.ok(next.handle);
  next = await f.flow.verify(next.handle, binding, '123456', 'offline', signal());
  f.fixtureProvider.mfa = async () => {
    throw new OwnedCodeRejected();
  };
  assert.ok(next.handle);
  next = await f.flow.verify(next.handle, binding, '000000', 'offline', signal(), 'mfa');
  f.fixtureProvider.mfa = async () => ({ kind: 'verified', tokens });
  assert.ok(next.handle);
  await f.flow.verify(next.handle, binding, '123456', 'offline', signal(), 'mfa');
  assert.deepEqual(
    f.admissions.map((a) => a.action),
    ['register', 'verify', 'mfa', 'mfa'],
  );
  assert.ok(f.admissions.every((a) => a.identityKey === 'a'.repeat(64)));
  assert.deepEqual(f.installedTickets, [f.admissions[0]!.ticket]);
  assert.equal(new Set(f.admissions.map((a) => a.ticket)).size, 4);
});

test('proof and durable admission failures never reach the provider', async () => {
  for (const atProof of [true, false]) {
    const f = flowFixture();
    if (atProof) f.deps.verifyProof = async () => false;
    else
      f.deps.guard = {
        ...f.deps.guard,
        admit: async () => {
          throw Error('limited');
        },
      };
    await assert.rejects(f.flow.start(signup, binding, signal()));
    assert.equal(f.counts().creations, 0);
  }
  const f = flowFixture();
  const next = await f.flow.start(signup, binding, signal());
  assert.ok(next.handle);
  f.deps.guard = {
    ...f.deps.guard,
    admit: async () => {
      throw Error('limited');
    },
  };
  await assert.rejects(f.flow.verify(next.handle, binding, '123456', 'offline', signal()));
  assert.equal(f.counts().verifications, 0);
  assert.equal(f.flows.size, 0);
});
