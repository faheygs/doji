import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWorkosSessionReader } from '../infra/portal-identity-candidate/workos-session.mts';
import type {
  PortalIdentity,
  PortalFetch,
} from '../infra/portal-identity-candidate/portal-contracts.mts';
type Config = Parameters<typeof createWorkosSessionReader>[0];
interface Overrides {
  config?: Partial<Config>;
  raw?: string;
  sessions?: unknown[];
  session?: Record<string, unknown>;
  user?: Record<string, unknown>;
  status?: number;
  proof?: unknown;
}
const config: Config = {
  enabled: true,
  realm: 'employee',
  clientId: 'client_staging',
  apiKey: 'sk_' + 'x'.repeat(24),
};
const identity: PortalIdentity = {
  realm: 'employee',
  issuer: 'https://api.workos.com/user_management/client_staging',
  audience: 'client_staging',
  subject: 'user_fixture',
  sessionId: 'session_fixture',
};
const proof = () => ({
  ...identity,
  method: 'workos-totp-grant',
  verifiedAtMs: Date.now(),
  expiresAtSeconds: Math.floor(Date.now() / 1000) + 300,
});
const user = { id: 'user_fixture', email_verified: true };
const session = {
  id: 'session_fixture',
  user_id: 'user_fixture',
  status: 'active',
  expires_at: new Date(Date.now() + 600000).toISOString(),
  ended_at: null,
};
function reader(overrides: Overrides = {}) {
  const calls: string[] = [];
  const fetcher: PortalFetch = async (url, opts) => {
    calls.push(url);
    assert.equal(opts.method, 'GET');
    assert.equal(opts.redirect, 'error');
    assert.ok(url.startsWith('https://api.workos.com/user_management/users/user_fixture'));
    return new Response(
      overrides.raw ??
        JSON.stringify(
          url.includes('/sessions?')
            ? { data: overrides.sessions ?? [{ ...session, ...overrides.session }] }
            : { ...user, ...overrides.user },
        ),
      { status: overrides.status ?? 200 },
    );
  };
  return {
    calls,
    fn: createWorkosSessionReader(
      { ...config, ...overrides.config },
      async () => (overrides.proof === undefined ? proof() : overrides.proof),
      fetcher,
    ),
  };
}
const signal = () => new AbortController().signal;
test('exact active session plus trusted TOTP receipt admits employee, bounded to two reads', async () => {
  const { fn, calls } = reader();
  const result = await fn(identity, signal());
  assert.equal(result.mfaVerified, true);
  assert.equal(calls.length, 2);
  assert.equal('email' in result, false);
});
for (const [label, overrides] of [
  ['disabled', { config: { enabled: false } }],
  ['unverified email', { user: { email_verified: false } }],
  ['wrong user', { user: { id: 'user_other' } }],
  ['deleted user', { user: { deleted_at: 'today' } }],
  ['revoked session', { session: { status: 'revoked' } }],
  ['ended session', { session: { ended_at: 'today' } }],
  ['expired session', { session: { expires_at: '2020-01-01' } }],
  ['malformed expiry', { session: { expires_at: 'invalid' } }],
  ['impersonated session', { session: { impersonator: { email: 'staff@test.invalid' } } }],
  ['other session owner', { session: { user_id: 'user_other' } }],
  ['missing session', { sessions: [] }],
  ['duplicate session', { sessions: [session, session] }],
  ['oversized page', { sessions: Array(11).fill(session) }],
  ['missing MFA proof', { proof: null }],
  ['wrong proof session', { proof: { ...proof(), sessionId: 'session_other' } }],
  ['wrong proof directory', { proof: { ...proof(), realm: 'business' } }],
  ['revoked proof', { proof: { ...proof(), revoked: true } }],
  ['expired proof', { proof: { ...proof(), expiresAtSeconds: 1 } }],
  ['future proof', { proof: { ...proof(), verifiedAtMs: Date.now() + 60000 } }],
  ['factor enrollment is not proof', { proof: { ...proof(), method: 'factor-enrolled' } }],
  ['provider failure', { status: 503 }],
  ['invalid JSON', { raw: 'not json' }],
  ['oversized response', { raw: 'x'.repeat(65537) }],
] satisfies [string, Overrides][])
  test(label + ' fails closed', async () => {
    await assert.rejects(reader(overrides).fn(identity, signal()), /could not be verified/);
  });
for (const [label, change] of [
  ['wrong realm', { realm: 'business' }],
  ['wrong audience', { audience: 'client_other' }],
  ['wrong issuer', { issuer: 'https://attacker.test' }],
  ['path injection', { subject: 'user_x/../other' }],
] as const)
  test(label + ' performs no provider requests', async () => {
    const { fn, calls } = reader();
    await assert.rejects(fn({ ...identity, ...change }, signal()));
    assert.equal(calls.length, 0);
  });
test('aborted caller performs no reads', async () => {
  const { fn, calls } = reader();
  const c = new AbortController();
  c.abort();
  await assert.rejects(fn(identity, c.signal));
  assert.equal(calls.length, 0);
});
test('business application session does not inherit employee MFA', async () => {
  const { fn } = reader({ config: { realm: 'business' }, proof: null });
  const r = await fn({ ...identity, realm: 'business' }, signal());
  assert.equal(r.mfaVerified, false);
});
test('source config mutation cannot enable a disabled reader', async () => {
  const c = { ...config, enabled: false };
  const fn = createWorkosSessionReader(c, async () => null);
  c.enabled = true;
  await assert.rejects(fn(identity, signal()));
});

test(
  'stalled provider stream and stalled cancellation cannot hold an aborted request',
  { timeout: 1000 },
  async () => {
    const caller = new AbortController();
    const streams: ReadableStream<Uint8Array>[] = [];
    let cancellations = 0;
    const fn = createWorkosSessionReader(
      config,
      async () => proof(),
      async () => {
        const stream = new ReadableStream<Uint8Array>({
          pull() {
            return new Promise(() => {});
          },
          cancel() {
            cancellations++;
            return new Promise(() => {});
          },
        });
        streams.push(stream);
        return new Response(stream);
      },
    );
    const pending = fn(identity, caller.signal);
    const timer = setTimeout(() => caller.abort(), 10);
    try {
      await assert.rejects(pending, /could not be verified/);
      assert.equal(streams.length, 2);
      assert.equal(cancellations, 2);
      assert.ok(streams.every((stream) => !stream.locked));
    } finally {
      clearTimeout(timer);
    }
  },
);

test(
  'oversized provider stream rejects even when cancellation never settles',
  { timeout: 1000 },
  async () => {
    const fn = createWorkosSessionReader(
      config,
      async () => proof(),
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array(65537));
            },
            cancel() {
              return new Promise(() => {});
            },
          }),
        ),
    );
    await assert.rejects(fn(identity, signal()), /could not be verified/);
  },
);
