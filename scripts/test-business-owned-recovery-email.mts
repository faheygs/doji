// Offline only. All HTTP is injected; never reads secrets or sends an email.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBusinessRecoveryEmail } from '../infra/portal-identity-candidate/business-owned-recovery-email.mts';
import { createBusinessOwnedProvider } from '../infra/portal-identity-candidate/business-owned-provider.mts';
const now = Date.now();
const token = 'synthetic-token-with-+&=%?#-characters';
const metadata = {
  resetId: 'password_reset_test',
  subject: 'user_business',
  tokenHash: createHash('sha256').update(token).digest('hex'),
  expires: now + 3600000,
};
const policy = {
  enabled: true,
  workosDefaultEmailDisabled: true,
  trackingDisabled: true,
  capacityApprovedUntil: now + 3600000,
  apiKey: 're_' + 'x'.repeat(24),
  from: 'Doji for Business <support@dojipro.com>',
};
const signal = () => new AbortController().signal;
const accepted = () => Response.json({ id: '00000000-0000-4000-8000-000000000001' });
test('recovery email uses an encoded fragment, pinned recipient, no tracking and stable idempotency', async () => {
  const requests: RequestInit[] = [];
  const mail = createBusinessRecoveryEmail(
    policy,
    async (url, init) => {
      assert.equal(url, 'https://api.resend.com/emails');
      requests.push(init!);
      return accepted();
    },
    () => now,
  );
  for (let i = 0; i < 2; i++) await mail.send('test@example.com', metadata, token, signal());
  assert.equal(requests.length, 2);
  assert.equal(requests[0]!.body, requests[1]!.body);
  const headers = new Headers(requests[0]!.headers);
  assert.equal(headers.get('idempotency-key'), 'business-owned-reset/password_reset_test');
  assert.equal(requests[0]!.redirect, 'error');
  const body = JSON.parse(String(requests[0]!.body));
  assert.deepEqual(body.to, ['test@example.com']);
  assert.match(body.html, /<html lang="en">/);
  assert.match(body.html, />Reset password<\/a>/);
  assert.match(body.html, /Doji logo/);
  const link = new URL(body.text.split('\n').find((line: string) => line.startsWith('https://')));
  assert.equal(link.origin, 'https://business.dojipro.com');
  assert.equal(link.pathname, '/business-portal/access/');
  assert.equal(link.search, '?mode=reset');
  assert.equal(new URLSearchParams(link.hash.slice(1)).get('token'), token);
  assert.equal(link.search.includes(token), false);
  const htmlLink = body.html
    .match(/href="([^"]+)"[^>]*>Reset password<\/a>/)?.[1]
    .replaceAll('&amp;', '&');
  assert.equal(htmlLink, link.href);
  assert.equal((body.html.match(/#token=/g) ?? []).length, 1);
});
test('absent, disabled, unqualified, expired and malformed mail policies fail before network', async () => {
  for (const config of [
    undefined,
    ...[
      { enabled: false },
      { workosDefaultEmailDisabled: false },
      { trackingDisabled: false },
      { capacityApprovedUntil: now },
      { capacityApprovedUntil: now + 86400001 },
      { apiKey: '' },
      { from: 'support@other.example' },
      { from: 'support@dojipro.com>' },
      { from: 'support@dojipro.com\r\nBcc: other@example.com' },
    ].map((change) => ({ ...policy, ...change })),
  ]) {
    let calls = 0;
    const mail = createBusinessRecoveryEmail(
      config,
      async () => {
        calls++;
        return accepted();
      },
      () => now,
    );
    await assert.rejects(mail.send('test@example.com', metadata, token, signal()));
    assert.equal(calls, 0);
  }
});
test('expired, mismatched or unsafe tokens and aborted calls never send', async () => {
  let calls = 0;
  const mail = createBusinessRecoveryEmail(
    policy,
    async () => {
      calls++;
      return accepted();
    },
    () => now,
  );
  for (const change of [
    { expires: now },
    { expires: now + 86400001 },
    { tokenHash: 'f'.repeat(64) },
    { resetId: 'bad' },
  ])
    await assert.rejects(
      mail.send('test@example.com', { ...metadata, ...change }, token, signal()),
    );
  await assert.rejects(mail.send('test@example.com', metadata, token + '\n', signal()));
  await assert.rejects(mail.send('test@example.com', metadata, token, AbortSignal.abort()));
  assert.equal(calls, 0);
});
test('unknown, rejected, malformed or oversized responses never retry or leak provider details', async () => {
  for (const response of [
    () => {
      throw Error(token);
    },
    () => Response.json({ message: token }, { status: 429 }),
    () => Response.json({ id: token }),
    () => new Response('x'.repeat(5000)),
    () => new Response('', { status: 302, headers: { location: 'https://example.com' } }),
  ]) {
    let calls = 0;
    const mail = createBusinessRecoveryEmail(
      policy,
      async () => {
        calls++;
        return response();
      },
      () => now,
    );
    await assert.rejects(
      mail.send('test@example.com', metadata, token, signal()),
      (error) =>
        error instanceof Error && error.message === 'Business recovery delivery unavailable.',
    );
    assert.equal(calls, 1);
  }
});
test('provider cannot create reset tokens without custom-mail opt-in and a delivery callback', async () => {
  for (const customResetEmailEnabled of [undefined, false, true]) {
    let calls = 0;
    const provider = createBusinessOwnedProvider(
      {
        enabled: true,
        sendingEnabled: true,
        customResetEmailEnabled,
        realm: 'business',
        origin: 'https://business.dojipro.com',
        clientId: 'client_business',
        apiKey: 'sk_' + 'x'.repeat(24),
      },
      async () => {
        calls++;
        return accepted();
      },
    );
    await assert.rejects(provider.recover('test@example.com', signal()));
    if (!customResetEmailEnabled)
      await assert.rejects(provider.recover('test@example.com', signal(), async () => {}));
    assert.equal(calls, 0);
  }
});
