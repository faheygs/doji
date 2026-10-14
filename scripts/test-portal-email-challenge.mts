import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { createPortalEmailChallengeDraft } from '../infra/portal-identity/proposals/email-code/portal-email-challenge.mts';
import type {
  EmailAttempt,
  EmailChallengeStore,
  EmailState,
} from '../infra/portal-identity/proposals/email-code/portal-email-challenge-contracts.mts';

// Serialized in-memory test adapter, not evidence of a qualified distributed DB store.
function fixture() {
  let time = 1_000_000,
    queue = Promise.resolve();
  const rows = new Map<string, EmailState>();
  const store: EmailChallengeStore = {
    async transact(key, reduce) {
      const previous = queue;
      let release!: () => void;
      queue = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        const { state, result } = reduce(rows.get(key) ?? null);
        rows.set(key, state);
        return result;
      } finally {
        release();
      }
    },
  };
  const attempt: EmailAttempt = {
    realm: 'employee',
    origin: 'https://admin.dojipro.com',
    audience: 'client_test',
    issuer: 'https://api.workos.com/user_management/client_test',
    subject: 'user_test',
    attemptId: randomUUID(),
    browserHash: 'a'.repeat(64),
    verifiedEmailHash: 'b'.repeat(64),
    passwordVerifiedAtMs: time,
  };
  const model = createPortalEmailChallengeDraft(randomBytes(32), store, () => time);
  const issue = async (a = attempt, requestId = randomUUID()) => {
    const result = await model.issue(a, requestId);
    assert.equal(result.kind, 'issued');
    if (result.kind !== 'issued') throw Error('Expected issued fixture');
    return result;
  };
  return {
    store,
    model,
    attempt,
    issue,
    rows,
    advance: (ms: number) => {
      time += ms;
    },
  };
}
test('email observation is one-use and never claims MFA assurance or session authority', async () => {
  const f = fixture(),
    item = await f.issue();
  assert.match(item.code, /^\d{6}$/);
  assert.deepEqual(await f.model.verify(f.attempt, item.challengeId, item.code), {
    kind: 'denied',
  });
  await f.model.providerAccepted(f.attempt, item.challengeId);
  const result = await f.model.verify(f.attempt, item.challengeId, item.code);
  assert.equal(result.kind, 'verified');
  if (result.kind === 'verified') {
    assert.equal(result.observation.method, 'email-code');
    assert.equal('mfaVerified' in result.observation, false);
    assert.equal('assurance' in result.observation, false);
  }
  assert.deepEqual(await f.model.verify(f.attempt, item.challengeId, item.code), {
    kind: 'denied',
  });
  assert.equal([...f.rows.values()][0]!.challenge!.codeMac, '');
});
test('first factor, identity, browser, email and realm bind each code', async () => {
  const f = fixture(),
    item = await f.issue();
  await f.model.providerAccepted(f.attempt, item.challengeId);
  const alternatives: EmailAttempt[] = [
    { ...f.attempt, subject: 'user_other' },
    { ...f.attempt, browserHash: 'c'.repeat(64) },
    { ...f.attempt, attemptId: randomUUID() },
    { ...f.attempt, verifiedEmailHash: 'd'.repeat(64) },
    { ...f.attempt, realm: 'business', origin: 'https://business.dojipro.com' },
    {
      ...f.attempt,
      audience: 'client_other',
      issuer: 'https://api.workos.com/user_management/client_other',
    },
  ];
  for (const attempt of alternatives)
    assert.deepEqual(await f.model.verify(attempt, item.challengeId, item.code), {
      kind: 'denied',
    });
  assert.equal((await f.model.verify(f.attempt, item.challengeId, item.code)).kind, 'verified');
});
test('expired or future first factors cannot mint or complete a challenge', async () => {
  const f = fixture(),
    item = await f.issue();
  await f.model.providerAccepted(f.attempt, item.challengeId);
  await assert.rejects(
    f.model.issue({ ...f.attempt, passwordVerifiedAtMs: 2_000_000 }, randomUUID()),
  );
  f.advance(300_000);
  await assert.rejects(f.model.verify(f.attempt, item.challengeId, item.code));
});
test('five failed attempts lock further guesses and resend does not reset that budget', async () => {
  const f = fixture(),
    item = await f.issue();
  await f.model.providerAccepted(f.attempt, item.challengeId);
  const wrong = item.code === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i++)
    assert.deepEqual(await f.model.verify(f.attempt, item.challengeId, wrong), { kind: 'denied' });
  assert.deepEqual(await f.model.verify(f.attempt, item.challengeId, item.code), {
    kind: 'denied',
  });
  f.advance(60_000);
  assert.deepEqual(await f.model.issue({ ...f.attempt, attemptId: randomUUID() }, randomUUID()), {
    kind: 'denied',
  });
});
test('resend cooldown, replacement and actor-wide send limit survive new browser attempts', async () => {
  const f = fixture(),
    first = await f.issue();
  await f.model.providerAccepted(f.attempt, first.challengeId);
  assert.deepEqual(await f.model.issue(f.attempt, randomUUID()), { kind: 'denied' });
  f.advance(60_000);
  await f.issue();
  assert.deepEqual(await f.model.verify(f.attempt, first.challengeId, first.code), {
    kind: 'denied',
  });
  f.advance(60_000);
  await f.issue();
  f.advance(60_000);
  assert.deepEqual(
    await f.model.issue(
      { ...f.attempt, browserHash: 'c'.repeat(64), attemptId: randomUUID() },
      randomUUID(),
    ),
    { kind: 'denied' },
  );
});
test('repeating an issue request never generates another code or email envelope', async () => {
  const f = fixture(),
    request = randomUUID(),
    first = await f.issue(f.attempt, request);
  assert.deepEqual(await f.model.issue(f.attempt, request), {
    kind: 'replayed',
    challengeId: first.challengeId,
  });
  assert.equal([...f.rows.values()][0]!.sends, 1);
  assert.equal('code' in [...f.rows.values()][0]!.challenge!, false);
});
test('concurrent correct verifications have one winner under the atomic store contract', async () => {
  const f = fixture(),
    item = await f.issue();
  await f.model.providerAccepted(f.attempt, item.challengeId);
  const results = await Promise.all(
    Array.from({ length: 10 }, () => f.model.verify(f.attempt, item.challengeId, item.code)),
  );
  assert.equal(results.filter((result) => result.kind === 'verified').length, 1);
});
test('store failure returns no delivery envelope or successful verification', async () => {
  const f = fixture();
  const model = createPortalEmailChallengeDraft(
    randomBytes(32),
    {
      transact: async () => {
        throw Error('unavailable');
      },
    },
    () => 1_000_000,
  );
  await assert.rejects(model.issue(f.attempt, randomUUID()), /unavailable/);
});

test('expiry is rechecked after acquiring the atomic store lock', async () => {
  const f = fixture();
  let time = 1_000_000;
  const delayed: EmailChallengeStore = {
    async transact(key, reduce) {
      time += 300_000;
      return f.store.transact(key, reduce);
    },
  };
  const model = createPortalEmailChallengeDraft(randomBytes(32), delayed, () => time);
  await assert.rejects(model.issue(f.attempt, randomUUID()));
  assert.equal(f.rows.size, 0);
});

test('provider acknowledgement and verification cannot use pre-lock timestamps', async () => {
  for (const operation of ['provider', 'verify']) {
    const f = fixture(),
      item = await f.issue();
    await f.model.providerAccepted(f.attempt, item.challengeId);
    const pending =
      operation === 'verify'
        ? f.model.verify(f.attempt, item.challengeId, item.code)
        : f.model.providerAccepted(f.attempt, item.challengeId);
    f.advance(300_000);
    await assert.rejects(pending);
    assert.equal([...f.rows.values()][0]!.challenge!.consumed, false);
  }
});
