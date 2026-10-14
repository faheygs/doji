// Offline orchestration tests. The durable mapping and provider are test doubles;
// no live reset link, mail, account, SQL or production request is used here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createBusinessOwnedReset,
  type OwnedResetDependencies,
  type OwnedResetMapping,
} from '../infra/portal-identity/business-owned-reset.mts';
const token = 'synthetic-private-reset-token';
const policy = {
  enabled: true,
  sendingEnabled: true,
  realm: 'business' as const,
  origin: 'https://business.dojipro.com',
  clientId: 'client_business',
  operationHmacKey: 'ab'.repeat(32),
};
const signal = () => new AbortController().signal;
function fixture(overrides = {}) {
  const events: string[] = [],
    operations: string[] = [];
  let state: 'new' | 'pending' | 'complete' = 'new';
  const mapping: OwnedResetMapping = {
    realm: 'business',
    origin: policy.origin,
    issuer: `https://api.workos.com/user_management/${policy.clientId}`,
    audience: policy.clientId,
    subject: 'user_business',
    tokenHash: createHash('sha256').update(token).digest('hex'),
    identityKey: 'c'.repeat(64),
    resetId: 'password_reset_test',
    expires: 1300000,
  };
  const deps: OwnedResetDependencies = {
    now: () => 1000000,
    trustedClientIp: '192.0.2.1',
    verifyProof: async () => {
      events.push('proof');
      return true;
    },
    resolve: async (hash) => {
      events.push('resolve');
      assert.equal(hash, mapping.tokenHash);
      return mapping;
    },
    provider: {
      reset: async (t, p) => {
        events.push('provider');
        assert.equal(t, token);
        assert.equal(p, 'new-password');
        assert.equal(state, 'pending');
        return mapping.subject;
      },
    },
    guard: {
      admit: async (action, identity, ip) => {
        events.push('admit');
        assert.equal(action, 'reset');
        assert.equal(identity, mapping.identityKey);
        assert.equal(ip, deps.trustedClientIp);
        return 'd'.repeat(64);
      },
      beginReset: async (operation, subject) => {
        events.push('begin');
        operations.push(operation);
        assert.match(operation, /^[a-f0-9]{64}$/);
        assert.equal(subject, mapping.subject);
        if (state !== 'new') return state;
        state = 'pending';
        return 'started';
      },
      completeReset: async (operation, subject, abort) => {
        events.push('complete');
        assert.equal(operation, operations[0]);
        assert.equal(subject, mapping.subject);
        assert.equal(abort.aborted, false);
        state = 'complete';
      },
    },
  };
  const reset = () => createBusinessOwnedReset({ ...policy, ...overrides }, deps);
  return { deps, mapping, events, operations, reset, state: () => state };
}
test('reset commits its fence before the provider, completes without creating a session', async () => {
  const f = fixture();
  assert.deepEqual(await f.reset()(token, 'new-password', 'proof', signal()), {
    step: 'reset-done',
  });
  assert.deepEqual(f.events, ['proof', 'resolve', 'admit', 'begin', 'provider', 'complete']);
  assert.equal(f.state(), 'complete');
  // A new coordinator/process reads the same receipt; it does not change password again.
  assert.deepEqual(await f.reset()(token, 'different-password', 'proof', signal()), {
    step: 'reset-done',
  });
  assert.equal(f.events.filter((x) => x === 'provider').length, 1);
  assert.equal(new Set(f.operations).size, 1);
});
test('disabled, sending-gated and rejected anti-abuse requests have no reset effects', async () => {
  for (const overrides of [{ enabled: false }, { sendingEnabled: false }]) {
    const f = fixture(overrides);
    await assert.rejects(f.reset()(token, 'new-password', 'proof', signal()));
    assert.deepEqual(f.events, []);
  }
  const f = fixture();
  f.deps.verifyProof = async () => false;
  await assert.rejects(f.reset()(token, 'new-password', 'proof', signal()));
  assert.equal(f.state(), 'new');
  assert.deepEqual(f.events, []);
});
test('unmapped, expired, wrong-token and cross-realm mappings never fence or mutate accounts', async () => {
  const variants = [
    null,
    { expires: 1000000 },
    { expires: NaN },
    { tokenHash: 'e'.repeat(64) },
    { origin: 'https://admin.dojipro.com' },
    { audience: 'client_employee' },
    { issuer: 'https://evil.example' },
    { subject: 'member-uuid' },
    { identityKey: 'email@example.com' },
  ];
  for (const variant of variants) {
    const f = fixture();
    f.deps.resolve = async () => (variant === null ? null : { ...f.mapping, ...variant });
    await assert.rejects(f.reset()(token, 'new-password', 'proof', signal()));
    assert.equal(f.state(), 'new');
    assert.ok(!f.events.includes('admit') && !f.events.includes('provider'));
  }
});
test('admission denial does not begin reset or call provider', async () => {
  const f = fixture();
  f.deps.guard = {
    ...f.deps.guard,
    admit: async () => {
      throw Error('limited');
    },
  };
  await assert.rejects(f.reset()(token, 'new-password', 'proof', signal()));
  assert.equal(f.state(), 'new');
  assert.ok(!f.events.includes('provider'));
});
test('concurrent reset requests dispatch the provider exactly once', async () => {
  const f = fixture();
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const original = f.deps.provider.reset;
  f.deps.provider = {
    reset: async (...args) => {
      await held;
      return original(...args);
    },
  };
  const first = f.reset()(token, 'new-password', 'proof', signal());
  const second = f.reset()(token, 'new-password', 'proof', signal());
  assert.deepEqual(await second, { step: 'reset-pending' });
  release();
  assert.deepEqual(await first, { step: 'reset-done' });
  assert.equal(f.events.filter((x) => x === 'provider').length, 1);
});
test('timeout or wrong provider subject retains fence across retries and coordinator restart', async () => {
  for (const wrongSubject of [false, true]) {
    const f = fixture();
    let calls = 0;
    f.deps.provider = {
      reset: async () => {
        calls++;
        if (wrongSubject) return 'user_other';
        throw Error('private provider timeout details');
      },
    };
    for (let i = 0; i < 3; i++)
      assert.deepEqual(await f.reset()(token, 'new-password', 'proof', signal()), {
        step: 'reset-pending',
      });
    assert.equal(calls, 1);
    assert.equal(f.state(), 'pending');
    assert.ok(!f.events.includes('complete'));
  }
});
test('lost fence response never permits a provider mutation on retry', async () => {
  const f = fixture();
  const begin = f.deps.guard.beginReset;
  f.deps.guard = {
    ...f.deps.guard,
    beginReset: async (...args) => {
      await begin(...args);
      throw Error('lost response after commit');
    },
  };
  assert.deepEqual(await f.reset()(token, 'new-password', 'proof', signal()), {
    step: 'reset-pending',
  });
  f.deps.guard = { ...f.deps.guard, beginReset: begin };
  assert.deepEqual(await f.reset()(token, 'new-password', 'proof', signal()), {
    step: 'reset-pending',
  });
  assert.equal(f.state(), 'pending');
  assert.ok(!f.events.includes('provider'));
});
test('a lost completion response recovers from the committed receipt without redispatch', async () => {
  for (const committed of [false, true]) {
    const f = fixture();
    const complete = f.deps.guard.completeReset;
    f.deps.guard = {
      ...f.deps.guard,
      completeReset: async (...args) => {
        if (committed) await complete(...args);
        throw Error('receipt response unavailable');
      },
    };
    assert.deepEqual(await f.reset()(token, 'new-password', 'proof', signal()), {
      step: 'reset-pending',
    });
    f.deps.guard = { ...f.deps.guard, completeReset: complete };
    assert.deepEqual(await f.reset()(token, 'new-password', 'proof', signal()), {
      step: committed ? 'reset-done' : 'reset-pending',
    });
    assert.equal(f.events.filter((x) => x === 'provider').length, 1);
    assert.equal(f.state(), committed ? 'complete' : 'pending');
  }
});
test('browser cancellation after confirmed provider success still commits the completion fence', async () => {
  const f = fixture(),
    abort = new AbortController();
  f.deps.provider = {
    reset: async () => {
      abort.abort();
      return f.mapping.subject;
    },
  };
  assert.deepEqual(await f.reset()(token, 'new-password', 'proof', abort.signal), {
    step: 'reset-done',
  });
  assert.equal(f.state(), 'complete');
});
test('cancellation or expiry after fence commit keeps fence without provider mutation', async () => {
  for (const expired of [false, true]) {
    const f = fixture(),
      abort = new AbortController();
    const begin = f.deps.guard.beginReset;
    f.deps.guard = {
      ...f.deps.guard,
      beginReset: async (...args) => {
        const state = await begin(...args);
        if (expired) f.mapping.expires = 1000000;
        else abort.abort();
        return state;
      },
    };
    assert.deepEqual(await f.reset()(token, 'new-password', 'proof', abort.signal), {
      step: 'reset-pending',
    });
    assert.equal(f.state(), 'pending');
    assert.ok(!f.events.includes('provider'));
  }
});
