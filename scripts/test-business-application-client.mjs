import assert from 'node:assert/strict';
import {
  createBusinessApplicationClient,
  createApplicationController,
} from '../website/business-portal/application-client.js';
import { applicationForm } from '../website/business-portal/application-form.js';
const config = { enabled: true, supabaseUrl: 'https://auth.example.test', anonKey: 'test-public' };
const session = {
  user: {
    id: 'business-one',
    role: 'doji_business',
    email_confirmed_at: '2026-01-01',
    app_metadata: { account_type: 'business' },
  },
  access_token: 'test-access',
  refresh_token: 'test-refresh',
  expires_in: 3600,
};
let count = 0;
async function test(label, fn) {
  await fn();
  count++;
  console.log(`PASS: ${label}`);
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const tick = () => new Promise((resolve) => setImmediate(resolve));
await test('live mode must be explicit', () =>
  assert.throws(() => createBusinessApplicationClient({ ...config, enabled: false })));
await test('secret key cannot enter browser configuration', () =>
  assert.throws(() =>
    createBusinessApplicationClient({ ...config, anonKey: 'sb_secret_private' }),
  ));
await test('legacy service JWT cannot enter browser configuration', () =>
  assert.throws(() =>
    createBusinessApplicationClient({
      ...config,
      anonKey: `e30.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.test`,
    }),
  ));
await test('member session rejected', async () => {
  const client = createBusinessApplicationClient(config, async () =>
    Response.json({ ...session, user: { ...session.user, role: 'authenticated' } }),
  );
  await assert.rejects(client.signin({}), /separate business/);
  assert.equal(client.hasSession(), false);
});
await test('signout beats late signin response', async () => {
  const delayed = deferred();
  const client = createBusinessApplicationClient(config, () => delayed.promise);
  const login = client.signin({});
  client.clear();
  delayed.resolve(Response.json(session));
  await assert.rejects(login, /no longer active/);
  assert.equal(client.hasSession(), false);
});
await test('local-only signout clears before request finishes', async () => {
  let path;
  const pending = deferred();
  const client = createBusinessApplicationClient(config, async (url) => {
    path = url;
    return url.includes('/business-auth') ? Response.json(session) : pending.promise;
  });
  await client.signin({});
  const out = client.signout();
  assert.equal(client.hasSession(), false);
  assert.match(path, /scope=local$/);
  pending.resolve(Response.json({}));
  await out;
});
await test('late protected response discarded after signout', async () => {
  const pending = deferred();
  const client = createBusinessApplicationClient(config, async (url) =>
    url.includes('/business-auth') ? Response.json(session) : pending.promise,
  );
  await client.signin({});
  const result = client.read();
  await tick();
  client.clear();
  pending.resolve(Response.json({ private: 'data' }));
  await assert.rejects(result, /session has ended/);
});
await test('parallel protected reads share one refresh', async () => {
  let refreshes = 0;
  const gate = deferred();
  const client = createBusinessApplicationClient(config, async (url) => {
    if (url.includes('/business-auth')) return Response.json({ ...session, expires_in: 1 });
    if (url.includes('refresh_token')) {
      refreshes++;
      await gate.promise;
      return Response.json(session);
    }
    return Response.json(null);
  });
  await client.signin({});
  const a = client.read(),
    b = client.read();
  await tick();
  assert.equal(refreshes, 1);
  gate.resolve();
  await Promise.all([a, b]);
});
await test('malformed successful read is not an empty application', async () => {
  const client = createBusinessApplicationClient(config, async (url) =>
    url.includes('/business-auth') ? Response.json(session) : new Response('not-json'),
  );
  await client.signin({});
  await assert.rejects(client.read(), /could not be read/);
  assert.equal(client.hasSession(), true);
});
function controllerFixture() {
  let epoch = 0,
    listener,
    read = async () => null,
    command = async () => ({ application: null });
  const client = {
    epoch: () => epoch,
    onClear: (fn) => {
      listener = fn;
      return () => {};
    },
    read: () => read(),
    command: (body) => command(body),
  };
  return {
    controller: createApplicationController(client),
    setRead: (fn) => {
      read = fn;
    },
    setCommand: (fn) => {
      command = fn;
    },
    clear: () => {
      epoch++;
      listener();
    },
  };
}
await test('ambiguous retry reuses intent key, edited retry gets new key', async () => {
  const f = controllerFixture(),
    keys = [];
  await f.controller.load();
  f.controller.edit('brand_name', 'One');
  f.setCommand(async (body) => {
    keys.push(body.p_request_id);
    throw Error('Timeout');
  });
  await f.controller.command('save');
  await f.controller.command('save');
  assert.equal(keys[0], keys[1]);
  f.controller.edit('brand_name', 'Two');
  await f.controller.command('save');
  assert.notEqual(keys[1], keys[2]);
  assert.equal(f.controller.snapshot().draft.brand_name, 'Two');
});
await test('logout removes private draft and ignores pending command', async () => {
  const f = controllerFixture(),
    gate = deferred();
  await f.controller.load();
  f.setCommand(() => gate.promise);
  f.controller.edit('legal_name', 'Private');
  const result = f.controller.command('save');
  f.clear();
  gate.resolve({ application: { details: { legal_name: 'Private' } } });
  await result;
  assert.deepEqual(f.controller.snapshot().draft, {});
  assert.equal(f.controller.snapshot().application, null);
});
await test('older refresh cannot overwrite newer command', async () => {
  const f = controllerFixture(),
    gate = deferred();
  await f.controller.load();
  f.setRead(() => gate.promise);
  const read = f.controller.load();
  await tick();
  f.setCommand(async () => ({
    application: { revision: 2, state: 'pending', details: { brand_name: 'New' } },
  }));
  await f.controller.command('submit');
  gate.resolve({ revision: 1, state: 'draft', details: { brand_name: 'Old' } });
  await read;
  assert.equal(f.controller.snapshot().application.revision, 2);
});
await test('remote revision preserves dirty draft and disables command', async () => {
  const f = controllerFixture();
  f.setRead(async () => ({ revision: 1, details: { brand_name: 'Old' } }));
  await f.controller.load();
  f.controller.edit('brand_name', 'Unsaved');
  f.setRead(async () => ({ revision: 2, details: { brand_name: 'Server' } }));
  await f.controller.load();
  assert.equal(f.controller.snapshot().draft.brand_name, 'Unsaved');
  assert.equal(f.controller.snapshot().stale, true);
  f.setCommand(() => {
    throw Error('Must not send');
  });
  await f.controller.command('save');
  await f.controller.load(true);
  assert.equal(f.controller.snapshot().draft.brand_name, 'Server');
  assert.equal(f.controller.snapshot().stale, false);
});
for (const code of ['PT409', '40001'])
  await test(`stale server error ${code} preserves form`, async () => {
    const f = controllerFixture();
    await f.controller.load();
    f.controller.edit('brand_name', 'Keep');
    f.setCommand(async () => {
      throw Object.assign(Error('Changed'), { code });
    });
    await f.controller.command('save');
    assert.equal(f.controller.snapshot().stale, true);
    assert.equal(f.controller.snapshot().draft.brand_name, 'Keep');
  });
await test('cold read failure cannot edit or send; successful empty read opens new draft', async () => {
  const f = controllerFixture();
  f.setCommand(() => {
    throw Error('Must not dispatch');
  });
  f.setRead(async () => {
    throw Error('Unavailable');
  });
  await f.controller.load();
  assert.equal(f.controller.snapshot().loaded, false);
  assert.equal(f.controller.snapshot().loading, false);
  assert.equal(f.controller.snapshot().readError, 'Unavailable');
  assert.equal(f.controller.snapshot().lastCheckedAt, null);
  f.controller.edit('brand_name', 'Cannot edit');
  await f.controller.command('save');
  assert.deepEqual(f.controller.snapshot().draft, {});
  f.setRead(async () => null);
  await f.controller.load();
  assert.equal(f.controller.snapshot().loaded, true);
  assert.equal(f.controller.snapshot().readError, '');
  assert.ok(f.controller.snapshot().lastCheckedAt);
  f.controller.edit('brand_name', 'Can edit');
  assert.equal(f.controller.snapshot().draft.brand_name, 'Can edit');
});
await test('failed refresh preserves edits, draft version and last successful check', async () => {
  const f = controllerFixture(),
    gate = deferred();
  f.setRead(async () => ({ revision: 1, details: { brand_name: 'Saved' } }));
  await f.controller.load();
  f.controller.edit('brand_name', 'Unsaved');
  const before = f.controller.snapshot();
  f.setRead(() => gate.promise);
  const read = f.controller.load();
  assert.equal(f.controller.snapshot().loading, true);
  gate.reject(Error('Offline'));
  await read;
  const after = f.controller.snapshot();
  assert.equal(after.loaded, true);
  assert.equal(after.loading, false);
  assert.equal(after.draft.brand_name, 'Unsaved');
  assert.equal(after.draftVersion, before.draftVersion);
  assert.equal(after.lastCheckedAt, before.lastCheckedAt);
  assert.equal(after.stale, false);
  f.setRead(async () => ({ revision: 1, details: { brand_name: 'Saved' } }));
  await f.controller.load();
  assert.equal(f.controller.snapshot().readError, '');
  assert.equal(f.controller.snapshot().draft.brand_name, 'Unsaved');
});
await test('logout clears freshness and fences an in-flight refresh', async () => {
  const f = controllerFixture(),
    gate = deferred();
  await f.controller.load();
  f.setRead(() => gate.promise);
  const read = f.controller.load();
  await tick();
  f.clear();
  gate.resolve({ revision: 2, details: { brand_name: 'Private' } });
  await read;
  assert.equal(f.controller.snapshot().loaded, false);
  assert.equal(f.controller.snapshot().loading, false);
  assert.equal(f.controller.snapshot().lastCheckedAt, null);
  assert.deepEqual(f.controller.snapshot().draft, {});
});
await test('same structured fields used for readonly review and input escaped', () => {
  const html = applicationForm(
    { brand_name: '<script>bad</script>', website: 'javascript:bad' },
    true,
    'review',
  );
  assert.ok(!html.includes('<script>'));
  assert.match(html, /&lt;script&gt;/);
  assert.equal((html.match(/ readonly/g) || []).length, 8);
  assert.ok(!html.includes('href='));
});
await test('new application omits street address while historical review retains it', () => {
  assert.ok(!applicationForm({}).includes('business_address'));
  assert.ok(
    !applicationForm({ business_address: 'Historical address' }).includes('business_address'),
  );
  assert.ok(
    applicationForm({ business_address: 'Historical address' }, true).includes(
      'Historical address',
    ),
  );
});
await test('late verification cannot restore a cleared session', async () => {
  const gate = deferred();
  const client = createBusinessApplicationClient(config, () => gate.promise);
  const pending = client.verifyLink('synthetic-ticket');
  client.clear();
  gate.resolve(Response.json({ ...session, business_flow: 'recovery' }));
  await assert.rejects(pending, /no longer active/);
  assert.equal(client.hasSession(), false);
});
await test('password change is unavailable outside recovery', async () => {
  let calls = 0;
  const client = createBusinessApplicationClient(config, async () => {
    calls++;
    return Response.json(session);
  });
  await client.signin({});
  await assert.rejects(client.resetPassword('new-password-test'), /recovery/);
  assert.equal(calls, 1);
});
await test('verified factors cannot be removed by enrollment', async () => {
  const paths = [];
  const client = createBusinessApplicationClient(config, async (url) => {
    paths.push(url);
    return Response.json(
      url.includes('business-auth')
        ? session
        : { ...session.user, factors: [{ id: 'f', factor_type: 'totp', status: 'verified' }] },
    );
  });
  await client.signin({});
  await assert.rejects(client.enroll(), /existing authenticator/);
  assert.equal(paths.length, 2);
});
await test('recovery verifies business identity again before password write', async () => {
  const paths = [];
  const client = createBusinessApplicationClient(config, async (url) => {
    paths.push(url);
    return Response.json(
      url.includes('business-auth')
        ? { ...session, business_flow: 'recovery' }
        : { ...session.user, role: 'authenticated' },
    );
  });
  await client.verifyLink('synthetic-ticket');
  await assert.rejects(client.resetPassword('new-password-test'), /identity/);
  assert.equal(client.hasSession(), false);
  assert.equal(paths.length, 2);
});
await test('invalid MFA code never dispatches', async () => {
  let calls = 0;
  const client = createBusinessApplicationClient(config, async () => {
    calls++;
    return Response.json(session);
  });
  await client.signin({});
  await assert.rejects(client.verifyFactor('f', '12345x'), /six-digit/);
  assert.equal(calls, 1);
});
await test('late MFA response cannot restore a cleared session', async () => {
  const gate = deferred();
  const client = createBusinessApplicationClient(config, async (url) => {
    if (url.includes('business-auth')) return Response.json(session);
    if (url.endsWith('/challenge')) return Response.json({ id: 'c' });
    return gate.promise;
  });
  await client.signin({});
  const pending = client.verifyFactor('f', '123456');
  await tick();
  client.clear();
  gate.resolve(Response.json(session));
  await assert.rejects(pending, /session has ended/);
  assert.equal(client.hasSession(), false);
});
console.log(`${count} isolated business client/state checks passed; no network.`);
