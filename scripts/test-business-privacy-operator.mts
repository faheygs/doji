import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createBusinessPrivacyOperator } from '../infra/portal-identity-candidate/business-privacy-operator.mts';
import type { BusinessPrivacySql } from '../infra/portal-identity-candidate/business-privacy-operator.mts';
const id = '88000000-0000-4000-8000-000000000001',
  execution = '88000000-0000-4000-8000-000000000002';
const config = {
  enabled: true,
  realm: 'business' as const,
  clientId: 'client_business',
  apiKey: 'sk_synthetic12345678',
};
const target = {
  case_id: id,
  account_id: execution,
  subject: 'user_business',
  issuer: 'https://api.workos.com/user_management/client_business',
  audience: 'client_business',
  kind: 'erasure',
  state: 'executing',
  revision: 2,
  delete_authorized: true,
};
function fixture(
  overrides: Record<string, unknown> = {},
  responses: (Response | Error)[] = [
    Response.json({ object: 'user', id: 'user_business' }),
    new Response(null, { status: 204 }),
    new Response(null, { status: 404 }),
  ],
) {
  const calls: string[] = [];
  const sqlCalls: string[] = [];
  const params: (string | number)[][] = [];
  const sql: BusinessPrivacySql = async (op, values) => {
    sqlCalls.push(op);
    params.push(values);
    return op === 'finish' ? { state: 'primary_erased' } : { ...target, ...overrides };
  };
  const op = createBusinessPrivacyOperator(config, sql, async (url, init) => {
    assert.equal(url, 'https://api.workos.com/user_management/users/user_business');
    assert.equal(init?.redirect, 'error');
    assert.ok(init?.signal);
    calls.push(String(init?.method));
    const response = responses.shift();
    if (response instanceof Error) throw response;
    assert.ok(response);
    return response;
  });
  return { op, calls, sqlCalls, params };
}
test('exact approved target: GET DELETE GET then evidence-bound finish', async () => {
  const f = fixture();
  assert.deepEqual(await f.op.erase(id, execution), { state: 'primary_erased' });
  assert.deepEqual(f.calls, ['GET', 'DELETE', 'GET']);
  assert.deepEqual(f.sqlCalls, ['claim', 'finish']);
  assert.match(String(f.params[1]?.[5]), /^workos-404:[a-f0-9]{64}$/);
});
test('ambiguous deletion stops; repeated execution never repeats DELETE', async () => {
  const f = fixture({}, [
    Response.json({ object: 'user', id: 'user_business' }),
    Error('private upstream'),
  ]);
  assert.equal((await f.op.erase(id, execution)).state, 'needs_provider_review');
  assert.deepEqual(f.sqlCalls, ['claim']);
  const replay = fixture({ delete_authorized: false }, [
    Response.json({ object: 'user', id: 'user_business' }),
  ]);
  assert.equal((await replay.op.erase(id, execution)).state, 'needs_provider_review');
  assert.deepEqual(replay.calls, ['GET']);
});
test('absent user reconciles after lost response without deleting again', async () => {
  const f = fixture({ delete_authorized: false }, [new Response(null, { status: 404 })]);
  await f.op.erase(id, execution);
  assert.deepEqual(f.calls, ['GET']);
  assert.deepEqual(f.sqlCalls, ['claim', 'finish']);
});
test('already finished cases perform no provider request', async () => {
  for (const state of ['primary_erased', 'completed']) {
    const f = fixture({ state }, []);
    assert.equal((await f.op.erase(id, execution)).state, state);
    assert.deepEqual(f.calls, []);
  }
});
test('wrong realm directory case and provider identity fail before deletion', async () => {
  for (const change of [
    { subject: 'user_bad/path' },
    { audience: 'client_employee' },
    { issuer: 'https://employee.test' },
    { case_id: execution },
    { account_id: 'invalid' },
    { kind: 'access' },
    { state: 'prepared' },
  ]) {
    const f = fixture(change);
    await assert.rejects(f.op.erase(id, execution));
    assert.deepEqual(f.calls, []);
  }
  for (const response of [
    Response.json({ object: 'user', id: 'user_employee' }),
    new Response('denied', { status: 401 }),
    new Response('bad', { status: 502 }),
    new Response('x'.repeat(32769)),
  ]) {
    const f = fixture({}, [response]);
    await assert.rejects(f.op.erase(id, execution));
    assert.deepEqual(f.calls, ['GET']);
  }
});
test('provider failures do not mark primary erased', async () => {
  for (const response of [new Response(null, { status: 500 }), Error('unknown')]) {
    const f = fixture({}, [Response.json({ object: 'user', id: 'user_business' }), response]);
    assert.equal((await f.op.erase(id, execution)).state, 'needs_provider_review');
    assert.deepEqual(f.sqlCalls, ['claim']);
  }
  const f = fixture({}, [
    Response.json({ object: 'user', id: 'user_business' }),
    new Response(null, { status: 204 }),
    Response.json({ object: 'user', id: 'user_business' }),
  ]);
  assert.equal((await f.op.erase(id, execution)).state, 'needs_provider_review');
  assert.deepEqual(f.sqlCalls, ['claim']);
});
test('identity export is exact case, bounded projection, rechecked before returning', async () => {
  const f = fixture({ kind: 'access', state: 'open', revision: 1 }, [
    Response.json({
      object: 'user',
      id: 'user_business',
      email: 'test@example.invalid',
      email_verified: true,
      first_name: null,
      metadata: { secret: 'not-exported' },
      password: 'not-exported',
    }),
  ]);
  const result = await f.op.exportIdentity(id, 1);
  assert.equal(result.scope, 'identity_profile_only');
  assert.deepEqual(result.identity, {
    id: 'user_business',
    email: 'test@example.invalid',
    email_verified: true,
    first_name: null,
  });
  assert.deepEqual(f.sqlCalls, ['export', 'export']);
  assert.deepEqual(f.calls, ['GET']);
});
test('export rejects absent user, stale case and invalid revision', async () => {
  const stale = fixture({ kind: 'access', state: 'open', revision: 2 });
  await assert.rejects(stale.op.exportIdentity(id, 1));
  assert.deepEqual(stale.calls, []);
  const absent = fixture({ kind: 'access', state: 'open', revision: 1 }, [
    new Response(null, { status: 404 }),
  ]);
  await assert.rejects(absent.op.exportIdentity(id, 1));
  for (const revision of [0, NaN, 1.2])
    await assert.rejects(fixture().op.exportIdentity(id, revision));
});
test('disabled or malformed operator never touches providers or SQL', async () => {
  for (const patch of [{ realm: 'employee' }, { clientId: 'bad' }, { apiKey: 'bad' }])
    assert.throws(() =>
      createBusinessPrivacyOperator({ ...config, ...patch } as typeof config, async () => null),
    );
  const op = createBusinessPrivacyOperator({ ...config, enabled: false }, async () => {
    throw Error('must not execute');
  });
  await assert.rejects(op.erase(id, execution));
  await assert.rejects(fixture().op.erase('invalid', execution));
  await assert.rejects(fixture().op.erase(id, 'invalid'));
});
