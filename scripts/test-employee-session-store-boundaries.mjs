// Actual store adapter, synthetic execute boundary. No SQL is sent anywhere.
import nodeTest from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeSessionStore } from '../infra/portal-identity-candidate/employee-session-store.mjs';
import { createBusinessSessionStore } from '../infra/portal-identity-candidate/business-session-store.mjs';
for (const [realm, createSessionStore] of [
  ['employee', createEmployeeSessionStore],
  ['business', createBusinessSessionStore],
]) {
  const test = (name, fn) => nodeTest(`${realm}: ${name}`, fn);
  const key = 'a'.repeat(64),
    now = 1_000_000;
  const config = {
    enabled: true,
    realm,
    origin: 'https://admin.dojipro.com',
    clientId: 'client_synthetic',
  };
  function fixture(responses = [], configOverride = {}) {
    const calls = [];
    const store = createSessionStore(
      { ...config, ...configOverride },
      async (role, sql, args, signal) => {
        calls.push({ role, sql, args, signal });
        const result = responses.shift();
        if (result instanceof Error) throw result;
        return result ?? { state: 'ok', value: 'sealed-session' };
      },
      () => now,
    );
    return { calls, store };
  }
  for (const patch of [
    { enabled: false },
    { realm: realm === 'employee' ? 'business' : 'employee' },
    { origin: 'http://admin.dojipro.com' },
    { origin: 'https://admin.dojipro.com/path' },
    { clientId: 'not-a-client' },
  ]) {
    test(`invalid employee-store config is denied: ${JSON.stringify(patch)}`, () =>
      assert.throws(() => fixture([], patch)));
  }
  test('put uses one parameterized committed operation with realm scope and a bounded TTL', async () => {
    const f = fixture();
    await f.store.putFlow(key, 'sealed-flow', now + 299999.2);
    await f.store.putSession(key, 'sealed-session', now + 28800000);
    for (const c of f.calls) {
      assert.equal(c.role, `doji_${realm}_session`);
      assert.match(
        c.sql,
        new RegExp(
          `^select ${realm}_session_private\\.execute_store\\(\\$1,\\$2,\\$3,\\$4,\\$5,\\$6::integer,\\$7,\\$8\\) as result$`,
        ),
      );
      assert.match(c.args[0], /^[a-f0-9]{64}$/);
      assert.equal(c.signal.aborted, false);
    }
    assert.deepEqual(f.calls[0].args.slice(1), [
      'put',
      'flow',
      key,
      'sealed-flow',
      300000,
      null,
      null,
    ]);
    assert.equal(f.calls[1].args[5], 28800000);
  });
  test('client IDs isolate database scopes even at the same portal origin', async () => {
    const first = fixture(),
      second = fixture([], { clientId: 'client_other' });
    await first.store.putFlow(key, 'first', now + 1000);
    await second.store.putFlow(key, 'second', now + 1000);
    assert.notEqual(first.calls[0].args[0], second.calls[0].args[0]);
  });
  for (const [method, expiry] of [
    ['putFlow', now],
    ['putFlow', now + 300001],
    ['putSession', now + 28800001],
    ['putSession', NaN],
    ['putSession', Infinity],
  ]) {
    test(`${method} rejects invalid expiry ${expiry} before execute`, async () => {
      const f = fixture();
      await assert.rejects(f.store[method](key, 'sealed', expiry), { status: 503 });
      assert.equal(f.calls.length, 0);
    });
  }
  test('invalid keys and aborted requests do not reach execute', async () => {
    const f = fixture();
    await assert.rejects(f.store.putFlow('raw-browser-cookie', 'sealed', now + 1000), {
      status: 503,
    });
    const controller = new AbortController();
    controller.abort(Error('cancelled'));
    await assert.rejects(
      f.store.putFlow(key, 'sealed', now + 1000, controller.signal),
      /cancelled/,
    );
    assert.equal(f.calls.length, 0);
  });
  test('capacity and unknown backend failures are bounded and do not leak database errors', async () => {
    for (const [result, status] of [
      [{ state: 'capacity' }, 429],
      [{ state: 'unexpected' }, 503],
      [Error('private database detail'), 503],
    ]) {
      const f = fixture([result]);
      await assert.rejects(f.store.putSession(key, 'sealed', now + 1000), {
        status,
        message: `${realm === 'employee' ? 'Employee' : 'Business'} session unavailable`,
      });
    }
  });
  test('wrong browser binding does not consume the valid browser flow', async () => {
    const f = fixture([{ state: 'ok', value: 'sealed-flow' }]);
    assert.equal(await f.store.consumeFlow(key, () => false), null);
    assert.deepEqual(
      f.calls.map((c) => c.args[1]),
      ['peek'],
    );
  });
  test('flow consume uses exact compare-and-delete and returns only the matching winner', async () => {
    const f = fixture([
      { state: 'ok', value: 'sealed-flow' },
      { state: 'ok', value: 'sealed-flow' },
    ]);
    assert.equal(await f.store.consumeFlow(key, () => true), 'sealed-flow');
    assert.deepEqual(
      f.calls.map((c) => c.args[1]),
      ['peek', 'take'],
    );
    assert.equal(f.calls[1].args[7], 'sealed-flow');
  });
  test('missing, raced and malformed flow results are handled without fabricated success', async () => {
    assert.equal(await fixture([{ state: 'missing' }]).store.consumeFlow(key, () => true), null);
    assert.equal(
      await fixture([{ state: 'ok', value: 'flow' }, { state: 'missing' }]).store.consumeFlow(
        key,
        () => true,
      ),
      null,
    );
    for (const replies of [
      [{ state: 'busy' }],
      [{ state: 'ok', value: 4 }],
      [
        { state: 'ok', value: 'flow' },
        { state: 'ok', value: 'other' },
      ],
    ]) {
      await assert.rejects(
        fixture(replies).store.consumeFlow(key, () => true),
        { status: 503 },
      );
    }
  });
  test('two concurrent consumers get exactly one flow from atomic conditional deletion', async () => {
    let taken = false;
    const store = createSessionStore(config, async (_role, _sql, args) => {
      if (args[1] === 'peek') return { state: 'ok', value: 'flow' };
      assert.equal(args[1], 'take');
      assert.equal(args[7], 'flow');
      if (taken) return { state: 'missing' };
      taken = true;
      return { state: 'ok', value: 'flow' };
    });
    assert.deepEqual(
      (
        await Promise.all([store.consumeFlow(key, () => true), store.consumeFlow(key, () => true)])
      ).sort(),
      ['flow', null].sort(),
    );
  });
  test('missing session reaches callback as null; busy lease fails promptly without callback', async () => {
    const missing = fixture([{ state: 'missing' }]);
    assert.equal(await missing.store.withSession(key, ({ value }) => value), null);
    assert.equal(missing.calls.length, 1);
    const busy = fixture([{ state: 'busy' }]);
    let called = false;
    await assert.rejects(
      busy.store.withSession(key, () => {
        called = true;
      }),
      { status: 409 },
    );
    assert.equal(called, false);
    assert.equal(busy.calls.length, 1);
    await assert.rejects(
      fixture([{ state: 'ok', value: null }]).store.withSession(key, () => {}),
      { status: 503 },
    );
  });
  test('replace and release use the exact acquired lease; returned application result is preserved', async () => {
    const f = fixture();
    assert.equal(
      await f.store.withSession(key, async ({ value, replace }) => {
        assert.equal(value, 'sealed-session');
        await replace('rotated-session');
        return 'application-result';
      }),
      'application-result',
    );
    assert.deepEqual(
      f.calls.map((c) => c.args[1]),
      ['acquire', 'replace', 'release'],
    );
    assert.match(f.calls[0].args[6], /^[a-f0-9]{64}$/);
    assert.equal(f.calls[1].args[4], 'rotated-session');
    assert.equal(new Set(f.calls.map((c) => c.args[6])).size, 1);
  });
  test('remove is idempotent, skips release and prevents replacing a revoked session', async () => {
    const f = fixture();
    await assert.rejects(
      f.store.withSession(key, async ({ remove, replace }) => {
        await remove();
        await remove();
        await replace('must-not-save');
      }),
      { status: 401 },
    );
    assert.deepEqual(
      f.calls.map((c) => c.args[1]),
      ['acquire', 'remove'],
    );
  });
  for (const status of [400, 403, 404, 409, 413, 429])
    test(`application rejection ${status} releases lease without revoking unrelated access`, async () => {
      const f = fixture(),
        error = Object.assign(Error('rejected'), { status });
      await assert.rejects(
        f.store.withSession(key, () => {
          throw error;
        }),
        (e) => e === error,
      );
      assert.deepEqual(
        f.calls.map((c) => c.args[1]),
        ['acquire', 'release'],
      );
    });
  test('unconfirmed release, replacement, callback failure or aborted request remove the session', async () => {
    for (const operation of ['release', 'replace', 'callback', 'abort', 'denial-release']) {
      const f = fixture(
        operation === 'release' || operation === 'replace' || operation === 'denial-release'
          ? [{ state: 'ok', value: 'sealed' }, { state: 'missing' }]
          : [],
      );
      const controller = new AbortController();
      await assert.rejects(
        f.store.withSession(
          key,
          async ({ replace }) => {
            if (operation === 'replace') await replace('rotated');
            if (operation === 'callback') throw Error('failed provider');
            if (operation === 'abort') controller.abort(Error('cancelled'));
            if (operation === 'denial-release')
              throw Object.assign(Error('denied'), { status: 403 });
          },
          controller.signal,
        ),
      );
      assert.equal(f.calls.at(-1).args[1], 'remove');
      assert.equal(f.calls.at(-1).signal.aborted, false);
    }
  });
  test('failed removal cannot claim success and cleanup failure preserves the original application error', async () => {
    const remove = fixture([{ state: 'ok', value: 'sealed' }, { state: 'bad' }]);
    await assert.rejects(
      remove.store.withSession(key, ({ remove }) => remove()),
      { status: 503 },
    );
    const original = Error('original'),
      f = fixture([{ state: 'ok', value: 'sealed' }, Error('cleanup')]);
    await assert.rejects(
      f.store.withSession(key, () => {
        throw original;
      }),
      (e) => e === original,
    );
  });
}
