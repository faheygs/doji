import { expect, it, vi } from 'vitest';
import { createOwnedAccessTransport } from './owned-access-transport';
import { BusinessPasswordRejected } from '../../../../infra/portal-identity-candidate/business-password-policy.mts';
const config = {
  enabled: true,
  origin: 'https://business.dojipro.com',
  termsVersion: 'terms-v1',
  privacyVersion: 'privacy-v1',
};
const csrf = 'a'.repeat(64);
const response = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const signal = () => new AbortController().signal;

it('requires explicit gate and exact business origin before any request', () => {
  const request = vi.fn();
  for (const policy of [{ ...config, enabled: false }, config]) {
    expect(() =>
      createOwnedAccessTransport(policy, {
        request,
        currentOrigin: 'https://admin.dojipro.com',
        proof: async () => '',
      }),
    ).toThrow();
  }
  expect(request).not.toHaveBeenCalled();
});
it('bootstraps CSRF, uses same-origin no-store requests and projects exact signup fields', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const client = createOwnedAccessTransport(config, {
    currentOrigin: config.origin,
    proof: async () => 'offline-proof',
    request: async (url, init) => {
      calls.push({ url: String(url), init: init! });
      return response(calls.length === 1 ? { csrf } : { step: 'verify' });
    },
  });
  expect(
    await client.transport(
      'register',
      {
        email: 'sample@example.com',
        password: 'sample-password',
        termsAccepted: true,
        privacyAcknowledged: true,
        subject: 'ignored',
      },
      signal(),
    ),
  ).toEqual({ step: 'verify' });
  expect(calls.map((c) => c.url)).toEqual([
    config.origin + '/auth/owned/bootstrap',
    config.origin + '/auth/owned/register',
  ]);
  const init = calls[1]!.init;
  expect(init.credentials).toBe('same-origin');
  expect(init.redirect).toBe('error');
  expect(init.cache).toBe('no-store');
  expect(new Headers(init.headers).get('X-Doji-CSRF')).toBe(csrf);
  expect(JSON.parse(String(init.body))).toEqual({
    proof: 'offline-proof',
    email: 'sample@example.com',
    password: 'sample-password',
    termsAccepted: true,
    privacyAcknowledged: true,
    country: 'US',
    termsVersion: 'terms-v1',
    privacyVersion: 'privacy-v1',
  });
});
it('rejects unexpected tokens, redirects, invalid states and raw server errors', async () => {
  for (const value of [
    { step: 'complete', access_token: 'secret' },
    { step: 'reset-done' },
    { step: 'unknown' },
    { message: 'secret backend' },
  ]) {
    let count = 0;
    const client = createOwnedAccessTransport(config, {
      currentOrigin: config.origin,
      proof: async () => 'proof',
      request: async () => response(++count === 1 ? { csrf } : value),
    });
    await expect(
      client.transport('signin', { email: 'sample@example.com', password: 'pw' }, signal()),
    ).rejects.toThrow('Please return to sign in');
    expect(count).toBe(2);
  }
});
it('never retries ambiguous writes and denies reset without a captured link', async () => {
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ csrf }))
    .mockRejectedValueOnce(Error('private transport'));
  const client = createOwnedAccessTransport(config, {
    currentOrigin: config.origin,
    proof: async () => 'proof',
    request,
  });
  await expect(
    client.transport('signin', { email: 'sample@example.com', password: 'pw' }, signal()),
  ).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
  await expect(client.transport('reset', { password: 'pw' }, signal())).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
});
it('submits a captured reset only once with no referrer and never logs in', async () => {
  let token = 'synthetic-reset-token-123456';
  const request = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(response({ csrf }))
    .mockResolvedValueOnce(response({ step: 'reset-done' }));
  const client = createOwnedAccessTransport(config, {
    currentOrigin: config.origin,
    proof: async () => 'proof',
    request,
    resetLink: {
      available: () => Boolean(token),
      take: () => {
        const value = token;
        token = '';
        return value;
      },
    },
  });
  expect(
    await client.transport('reset', { password: 'new-password', token: 'ignored' }, signal()),
  ).toEqual({ step: 'reset-done' });
  expect(request.mock.calls[1]![0]).toBe(config.origin + '/auth/owned/reset');
  expect(request.mock.calls[1]![1]!.referrerPolicy).toBe('no-referrer');
  expect(JSON.parse(String(request.mock.calls[1]![1]!.body))).toEqual({
    proof: 'proof',
    password: 'new-password',
    token: 'synthetic-reset-token-123456',
  });
  await expect(client.transport('reset', { password: 'again' }, signal())).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(2);
});
it('treats lost or malformed reset responses as uncertain without retrying', async () => {
  for (const reply of [null, { step: 'complete' }, { step: 'reset-done', token: 'private' }]) {
    let token = 'synthetic-reset-token-123456';
    const request = vi.fn<typeof fetch>().mockResolvedValueOnce(response({ csrf }));
    if (reply) request.mockResolvedValueOnce(response(reply));
    else request.mockRejectedValueOnce(Error('private backend detail'));
    const client = createOwnedAccessTransport(config, {
      currentOrigin: config.origin,
      proof: async () => 'proof',
      request,
      resetLink: {
        available: () => Boolean(token),
        take: () => {
          const value = token;
          token = '';
          return value;
        },
      },
    });
    expect(await client.transport('reset', { password: 'new-password' }, signal())).toEqual({
      step: 'reset-pending',
    });
    expect(token).toBe('');
    expect(request).toHaveBeenCalledTimes(2);
  }
});
it('dispose aborts a pending bootstrap and suppresses a late completion', async () => {
  let finish!: (value: Response) => void;
  const request = vi.fn<typeof fetch>(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const client = createOwnedAccessTransport(config, {
    currentOrigin: config.origin,
    proof: async () => 'proof',
    request,
  });
  const pending = client.transport(
    'signin',
    { email: 'sample@example.com', password: 'pw' },
    signal(),
  );
  client.dispose();
  finish(response({ csrf }));
  await expect(pending).rejects.toThrow();
  expect(request.mock.calls[0]![1]!.signal!.aborted).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});
it('bounds response size and cancels reading', async () => {
  const request = vi.fn<typeof fetch>().mockResolvedValue(response({ csrf: 'a'.repeat(5000) }));
  const client = createOwnedAccessTransport(config, {
    currentOrigin: config.origin,
    proof: async () => 'proof',
    request,
  });
  await expect(client.transport('signin', {}, signal())).rejects.toThrow();
  expect(request).toHaveBeenCalledTimes(1);
});

it('preserves only exact password field errors on registration 422, without automatic retry', async () => {
  for (const code of [
    'password_too_short',
    'password_too_long',
    'password_contains_email',
    'password_requirements',
  ]) {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ csrf }))
      .mockResolvedValueOnce(response({ field: 'password', code }, 422));
    const client = createOwnedAccessTransport(config, {
      currentOrigin: config.origin,
      request,
      proof: async () => 'proof',
    });
    await expect(client.transport('register', {}, signal())).rejects.toBeInstanceOf(
      BusinessPasswordRejected,
    );
    expect(request).toHaveBeenCalledTimes(2);
  }
});

it('does not mislabel unknown, oversized or wrong-status responses as password errors', async () => {
  for (const [body, status, action] of [
    [{ field: 'password', code: 'private_code' }, 422, 'register'],
    [{ field: 'password', code: 'password_requirements', message: 'private' }, 422, 'register'],
    [{ field: 'password', code: 'password_requirements' }, 503, 'register'],
    [{ field: 'password', code: 'password_requirements' }, 200, 'register'],
    [{ field: 'password', code: 'password_requirements' }, 422, 'signin'],
    [
      { field: 'password', code: 'password_requirements', message: 'x'.repeat(2000) },
      422,
      'register',
    ],
  ] as const) {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(response({ csrf }))
      .mockResolvedValueOnce(response(body, status));
    const client = createOwnedAccessTransport(config, {
      currentOrigin: config.origin,
      request,
      proof: async () => 'proof',
    });
    await expect(client.transport(action, {}, signal())).rejects.toThrow(
      'Please return to sign in',
    );
    expect(request).toHaveBeenCalledTimes(2);
  }
});
