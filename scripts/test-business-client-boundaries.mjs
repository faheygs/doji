// Actual retained business client/controller, injected HTTP only. No live login.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBusinessApplicationClient,
  createApplicationController,
} from '../website/business-portal/application-client.js';
import {
  applicationForm,
  businessStateLabel,
} from '../website/business-portal/application-form.js';
import { createBusinessRealtime } from '../website/business-portal/business-realtime.js';
const config = {
  enabled: true,
  supabaseUrl: 'https://business.example.test',
  anonKey: 'synthetic',
  realtimeEnabled: true,
};
const jwt = (aal) => `e30.${Buffer.from(JSON.stringify({ aal })).toString('base64url')}.synthetic`;
const session = {
  user: {
    id: 'business-one',
    role: 'doji_business',
    app_metadata: { account_type: 'business' },
    email_confirmed_at: '2026-01-01',
  },
  access_token: jwt('aal1'),
  refresh_token: 'synthetic',
  expires_in: 3600,
};
const tick = () => new Promise(setImmediate);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function fixture(handler = () => Response.json(null), initial = session, patch = {}) {
  const calls = [];
  const client = createBusinessApplicationClient({ ...config, ...patch }, async (url, options) => {
    calls.push({ url, options });
    if (url.endsWith('/business-auth')) return Response.json(initial);
    return handler(url, options);
  });
  return { client, calls };
}

test('public anon JWT and form rendering retain safe structured defaults', () => {
  const key = `e30.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.synthetic`;
  assert.ok(createBusinessApplicationClient({ ...config, anonKey: key }));
  assert.ok(applicationForm().includes('Choose an industry'));
  assert.match(
    applicationForm({ category: 'Technology' }),
    /<option selected>Technology<\/option>/,
  );
  assert.equal(businessStateLabel('not-a-state'), 'New application');
  assert.equal(businessStateLabel('pending'), 'Pending review');
});
test('signed-out operations do not send requests and assurance stays null', async () => {
  const { client, calls } = fixture();
  await assert.rejects(client.read(), /Sign in/);
  await assert.rejects(client.factors(), /Sign in/);
  await client.signout();
  assert.equal(client.assurance(), null);
  assert.equal(calls.length, 0);
});
test('auth failure with missing JSON has safe feedback', async () => {
  const client = createBusinessApplicationClient(
    config,
    async () => new Response('not-json', { status: 503 }),
  );
  await assert.rejects(client.signin({}), {
    message: 'The request could not be completed.',
    status: 503,
  });
});
for (const status of [401, 403])
  test(`RPC ${status} clears retained business session`, async () => {
    const { client } = fixture(() => Response.json({ message: 'Denied' }, { status }));
    await client.signin({});
    await assert.rejects(client.read(), { status });
    assert.equal(client.hasSession(), false);
  });
test('protected Auth rejection clears only on the explicit 401 boundary', async () => {
  const { client } = fixture(() => Response.json({}, { status: 401 }));
  await client.signin({});
  await assert.rejects(client.factors(), { status: 401 });
  assert.equal(client.hasSession(), false);
});
for (const next of [null, { ...session, user: { ...session.user, id: 'different-business' } }])
  test(`refresh refuses mismatched identity ${next?.user?.id ?? 'missing'}`, async () => {
    const { client } = fixture(() => Response.json(next), { ...session, expires_in: 0 });
    await client.signin({});
    await assert.rejects(client.read(), /identity could not be verified/);
    assert.equal(client.hasSession(), false);
  });
test('failed refresh clears session and late refresh cannot restore it after clear', async () => {
  for (const reject of [true, false]) {
    const gate = deferred();
    const { client } = fixture(() => gate.promise, { ...session, expires_in: 0 });
    await client.signin({});
    const pending = client.read();
    await tick();
    if (reject) gate.reject(Error('Refresh failed'));
    else {
      client.clear();
      gate.resolve(Response.json(session));
    }
    await assert.rejects(pending);
    assert.equal(client.hasSession(), false);
  }
});
test('clear between immediate token resolution and RPC/Auth/realtime dispatch prevents the request', async () => {
  for (const method of ['read', 'factors', 'realtimeToken']) {
    const { client, calls } = fixture();
    await client.signin({});
    const pending = client[method]();
    client.clear();
    await assert.rejects(pending, /session has ended/);
    assert.equal(calls.length, 1);
  }
});
test('real-time disabled gate dispatches nothing', async () => {
  const { client, calls } = fixture(undefined, session, { realtimeEnabled: false });
  await assert.rejects(client.realtimeToken(), /not enabled/);
  assert.equal(calls.length, 0);
});
for (const response of [
  null,
  { topic: 'business:other:events' },
  { topic: 'business:business-one:events', tokenRequest: { clientId: 'other' } },
])
  test(`realtime identity mismatch never installs a capability ${JSON.stringify(response)}`, async () => {
    const { client } = fixture(() => Response.json(response));
    await client.signin({});
    await assert.rejects(client.realtimeToken(), /identity could not be verified/);
  });
for (const status of [401, 403])
  test(`realtime ${status} clears session`, async () => {
    const { client } = fixture(() => Response.json({}, { status }));
    await client.signin({});
    await assert.rejects(client.realtimeToken(), { status });
    assert.equal(client.hasSession(), false);
  });
test('verified link requires a supported business flow', async () => {
  for (const next of [null, { ...session, business_flow: 'other' }]) {
    const { client } = fixture(undefined, next);
    await assert.rejects(client.verifyLink('synthetic'), /separate business account/);
    assert.equal(client.hasSession(), false);
  }
});
test('enrollment deletes only unverified TOTP factors and encodes their IDs', async () => {
  const { client, calls } = fixture((url) =>
    Response.json(
      url.endsWith('/user')
        ? {
            ...session.user,
            factors: [
              { id: 'stale/factor', factor_type: 'totp', status: 'unverified' },
              { id: 'phone', factor_type: 'phone', status: 'unverified' },
            ],
          }
        : { id: 'new' },
    ),
  );
  await client.signin({});
  await client.enroll();
  const deletes = calls.filter((call) => call.options.method === 'DELETE');
  assert.equal(deletes.length, 1);
  assert.ok(deletes[0].url.endsWith('/stale%2Ffactor'));
  assert.equal(deletes[0].options.body, undefined);
});
for (const next of [null, { ...session, user: { ...session.user, id: 'other' } }, session])
  test(`MFA response requires same identity and AAL2: ${next?.user?.id ?? 'missing'}`, async () => {
    const { client } = fixture((url) =>
      Response.json(url.endsWith('/challenge') ? { id: 'challenge' } : next),
    );
    await client.signin({});
    await assert.rejects(client.verifyFactor('factor', '123456'));
    assert.equal(client.hasSession(), false);
  });
test('existing verified MFA cannot be bypassed by password recovery', async () => {
  const { client, calls } = fixture(
    () =>
      Response.json({ ...session.user, factors: [{ factor_type: 'totp', status: 'verified' }] }),
    { ...session, business_flow: 'recovery' },
  );
  await client.verifyLink('synthetic');
  await assert.rejects(
    client.resetPassword('synthetic-new-password'),
    /Verify your existing authenticator/,
  );
  assert.equal(
    calls.some((call) => call.options.method === 'PUT'),
    false,
  );
});
test('recovery refuses mismatched identity returned by password write', async () => {
  const { client } = fixture(
    (_url, options) =>
      Response.json(options.method === 'PUT' ? { ...session.user, id: 'other' } : session.user),
    { ...session, business_flow: 'recovery' },
  );
  await client.verifyLink('synthetic');
  await assert.rejects(
    client.resetPassword('synthetic-new-password'),
    /identity could not be verified/,
  );
  assert.equal(client.hasSession(), false);
});
test('controller coalesces active reads and suppresses duplicate commands/edits while pending', async () => {
  const read = deferred(),
    command = deferred();
  let reads = 0,
    writes = 0;
  const controller = createApplicationController({
    epoch: () => 0,
    onClear: () => () => {},
    read: () => {
      reads++;
      return read.promise;
    },
    command: () => {
      writes++;
      return command.promise;
    },
  });
  const a = controller.load(),
    b = controller.load();
  await tick();
  assert.equal(reads, 1);
  read.resolve(null);
  await Promise.all([a, b]);
  controller.edit('brand_name', 'Kept');
  const first = controller.command('save');
  controller.edit('brand_name', 'Ignored');
  await controller.load();
  await controller.command('save');
  assert.equal(writes, 1);
  assert.equal(reads, 1);
  assert.equal(controller.snapshot().draft.brand_name, 'Kept');
  command.resolve({ application: { revision: 1, details: {} } });
  await first;
  controller.destroy();
});
test('controller clear before scheduled read and late failed command both discard obsolete results', async () => {
  let epoch = 0,
    clear,
    reads = 0;
  const gate = deferred();
  const controller = createApplicationController({
    epoch: () => epoch,
    onClear: (fn) => {
      clear = () => {
        epoch++;
        fn();
      };
      return () => {};
    },
    read: async () => {
      reads++;
      return null;
    },
    command: () => gate.promise,
  });
  const early = controller.load();
  clear();
  await early;
  assert.equal(reads, 0);
  assert.equal(controller.snapshot().loaded, false);
  await controller.load();
  const write = controller.command('save');
  clear();
  gate.reject(Error('Late failure'));
  await write;
  assert.equal(controller.snapshot().error, '');
  assert.equal(controller.snapshot().pending, false);
  controller.destroy();
});

function realtimeFixture(options = {}) {
  const state = { statuses: [], reads: 0, closes: 0, tokens: 0, epoch: 0, signedIn: true };
  const client = {
    hasSession: () => state.signedIn,
    epoch: () => state.epoch,
    onClear: (fn) => {
      state.clear = fn;
      return () => {};
    },
    realtimeToken: async () => {
      state.tokens++;
      if (options.tokenError) throw Error('Denied');
      return {
        topic:
          options.topic?.(state.tokens) ?? 'business:78000000-0000-4000-8000-000000000001:events',
        tokenRequest: {},
      };
    },
  };
  state.transport = createBusinessRealtime({
    client,
    enabled: true,
    reconcile: () => state.reads++,
    status: (text) => state.statuses.push(text),
    loadSdk: async () => ({
      Realtime: class {
        constructor(settings) {
          state.settings = settings;
        }
        connection = {
          on: (fn) => {
            state.connection = fn;
          },
          off: () => {},
        };
        channels = {
          get: () => ({
            on: (fn) => {
              state.channel = fn;
            },
            off: () => {},
            subscribe: async (_name, fn) => {
              state.hint = fn;
            },
            unsubscribe: () => {
              if (options.cleanupError) throw Error('Cleanup');
            },
          }),
        };
        connect() {}
        close() {
          state.closes++;
          if (options.cleanupError) throw Error('Close');
        }
      },
    }),
  });
  return state;
}
test('realtime initialization failure displays fallback without retry loops', async () => {
  const f = realtimeFixture({ tokenError: true });
  await f.transport.start();
  assert.equal(f.tokens, 1);
  assert.equal(f.closes, 0);
  assert.deepEqual(f.statuses, ['Live updates unavailable. Use Refresh.']);
});
for (const source of ['channel', 'connection'])
  test(`failed ${source} locks realtime even if cleanup throws`, async () => {
    const f = realtimeFixture({ cleanupError: true });
    await f.transport.start();
    f[source]({ current: 'failed' });
    assert.equal(f.closes, 1);
    assert.equal(f.statuses.at(-1), 'Live updates unavailable. Use Refresh.');
    const reads = f.reads;
    f.channel({ current: 'attached', resumed: false });
    assert.equal(f.reads, reads);
  });
test('realtime interruption reports fallback and renewal rejects a changed topic', async () => {
  const f = realtimeFixture({
    topic: (n) => (n === 1 ? 'business:first:events' : 'business:other:events'),
  });
  await f.transport.start();
  for (const current of ['disconnected', 'suspended']) f.connection({ current });
  assert.ok(f.statuses.every((text) => text === 'Live updates interrupted. Use Refresh.'));
  const auth = () =>
    new Promise((resolve) => f.settings.authCallback({}, (...result) => resolve(result)));
  assert.equal((await auth())[0], null);
  assert.deepEqual(await auth(), ['Business session ended', null]);
  f.transport.destroy();
});
