import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeResources } from '../infra/portal-identity-candidate/employee-resources.mjs';
const origin = 'https://abcdefghijklmnopqrst.supabase.co',
  id = '11111111-1111-4111-8111-111111111111';
function fixture(patch = {}) {
  const calls = [];
  const app = {
    authorize: async () => ({ user_id: id }),
    command: async (actor, input) => {
      calls.push(['authorize', input]);
      if (patch.denied) throw Object.assign(Error('denied'), { status: 403 });
      if (input.name === 'portal_evidence_authorization_v1')
        return {
          bucket: input.args.p_bucket,
          path: input.args.p_path,
          expiresIn: 300,
          ...patch.result,
        };
      if (input.name === 'get_admin_realtime_token_capabilities')
        return { userId: id, isAdmin: true, authorizedPostIds: [], ...patch.result };
      return { ordinary: true };
    },
  };
  const resource = createEmployeeResources(app, {
    storageOrigin: origin,
    signStorage: async (args) => {
      calls.push(['storage', args]);
      return (
        patch.url || `${origin}/storage/v1/object/sign/${args.bucket}/${args.path}?token=opaque`
      );
    },
    signRealtime: async (args) => {
      calls.push(['realtime', args]);
      return { keyName: 'example.key', ...args };
    },
  });
  return {
    calls,
    run: (name, args) => resource.command({}, { name, args }, AbortSignal.timeout(1000)),
  };
}
test('evidence authorization precedes exact object signing with fixed TTL', async () => {
  const f = fixture();
  const result = await f.run('portal_sign_evidence_v1', { bucket: 'post-media', path: 'test.jpg' });
  assert.equal(f.calls[0][0], 'authorize');
  assert.equal(f.calls[1][0], 'storage');
  assert.equal(f.calls[1][1].expiresIn, 300);
  assert.equal(result.expiresIn, 300);
});
for (const path of [
  '../test.jpg',
  'a/../test.jpg',
  'a//b',
  'a%2fb',
  'https://elsewhere.test/a',
  'a?b',
  'a#b',
  'a\\b',
  'a\0b',
])
  test(`invalid evidence path ${JSON.stringify(path)}`, async () => {
    const f = fixture();
    await assert.rejects(f.run('portal_sign_evidence_v1', { bucket: 'post-media', path }), {
      status: 400,
    });
    assert.equal(f.calls.length, 0);
  });
test('denied and mismatched database capabilities never reach signing', async () => {
  for (const patch of [
    { denied: true },
    { result: { path: 'another.jpg' } },
    { result: { expiresIn: 999 } },
    { result: { bucket: 'private' } },
  ]) {
    const f = fixture(patch);
    await assert.rejects(
      f.run('portal_sign_evidence_v1', { bucket: 'post-media', path: 'test.jpg' }),
    );
    assert.equal(f.calls.length, 1);
  }
});
test('signer cannot substitute external, alternate object, missing token or fragment URL', async () => {
  for (const url of [
    'https://attacker.test/test.jpg?token=x',
    `${origin}/storage/v1/object/sign/post-media/other.jpg?token=x`,
    `${origin}/storage/v1/object/sign/post-media/test.jpg`,
    `${origin}/storage/v1/object/sign/post-media/test.jpg?token=x#fragment`,
  ]) {
    const f = fixture({ url });
    await assert.rejects(
      f.run('portal_sign_evidence_v1', { bucket: 'post-media', path: 'test.jpg' }),
      { status: 503 },
    );
  }
});
test('realtime retains only existing identifier channels and TTL', async () => {
  const f = fixture();
  await f.run('portal_realtime_token_v1', {});
  assert.deepEqual(f.calls[1], [
    'realtime',
    {
      clientId: id,
      ttl: 900000,
      capability: { 'doji:global': ['subscribe'], 'moderation:global': ['subscribe'] },
    },
  ]);
});
test('invalid realtime capability cannot be signed', async () => {
  for (const result of [
    { isAdmin: false },
    { userId: 'user_provider' },
    { authorizedPostIds: [id] },
  ]) {
    const f = fixture({ result });
    await assert.rejects(f.run('portal_realtime_token_v1', {}), { status: 403 });
    assert.equal(f.calls.length, 1);
  }
});
test('browser cannot choose resource TTL, capability or call intermediate checks', async () => {
  for (const [name, args] of [
    ['portal_sign_evidence_v1', { bucket: 'post-media', path: 'test.jpg', expiresIn: 999 }],
    ['portal_realtime_token_v1', { capability: { '*': ['*'] } }],
    ['get_admin_realtime_token_capabilities', {}],
    ['portal_evidence_authorization_v1', { p_bucket: 'post-media', p_path: 'test.jpg' }],
  ]) {
    const f = fixture();
    await assert.rejects(f.run(name, args));
    assert.equal(f.calls.length, 0);
  }
});
test('ordinary atomic operations are delegated unchanged', async () => {
  const f = fixture();
  assert.deepEqual(await f.run('admin_triage_report', { p_report_id: id }), { ordinary: true });
  assert.equal(f.calls.length, 1);
});

test('health is separately delegated with exact actor/signal and no resource signing', async () => {
  const actor = { subject: 'synthetic' },
    signal = AbortSignal.timeout(1000),
    calls = [];
  const application = {
    authorize: async (...args) => {
      calls.push(args);
      return actor;
    },
    command: async () => {
      throw Error('Unexpected command');
    },
  };
  const dependencies = {
    storageOrigin: origin,
    signStorage: () => {
      throw Error('Unexpected signing');
    },
    signRealtime: () => {
      throw Error('Unexpected signing');
    },
  };
  const resources = createEmployeeResources(application, {
    ...dependencies,
    health: async (...args) => {
      calls.push(args);
      return { bounded: true };
    },
  });
  assert.equal(await resources.authorize(actor, signal), actor);
  assert.deepEqual(
    await resources.command(actor, { name: 'portal_platform_health_v1', args: {} }, signal),
    { bounded: true },
  );
  assert.deepEqual(calls, [
    [actor, signal],
    [actor, signal],
  ]);
  for (const args of [undefined, { unexpected: true }])
    await assert.rejects(
      resources.command(actor, { name: 'portal_platform_health_v1', args }, signal),
      { status: 400 },
    );
  await assert.rejects(
    createEmployeeResources(application, dependencies).command(
      actor,
      { name: 'portal_platform_health_v1', args: {} },
      signal,
    ),
    { status: 503 },
  );
  assert.throws(() => createEmployeeResources(null, dependencies), { status: 503 });
});
