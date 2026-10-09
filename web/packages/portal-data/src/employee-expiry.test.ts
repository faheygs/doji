import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmployeeSession } from './employee-session';

const authenticated = {
  signedIn: true,
  assurance: 'aal2',
  csrf: 'c'.repeat(43),
  operator: {
    user_id: '10000000-0000-4000-8000-000000000001',
    capabilities: { moderation_read: true },
  },
};
function fixture(failLogout = false) {
  const upstream = vi.fn(async (url: string) => {
    if (url.endsWith('/auth/logout')) {
      if (failLogout) throw Error('Synthetic unavailable service');
      return Response.json({ signedIn: false });
    }
    return Response.json(url.endsWith('/api/session') ? authenticated : { items: [] });
  });
  const client = createEmployeeSession(
    { independentEmployeeIdentity: true, staffWorkflowEnabled: true },
    { origin: 'https://admin.dojipro.com', upstream },
  );
  return { client, upstream };
}
afterEach(() => vi.useRealTimers());
describe('employee session expiry', () => {
  it('clears private cache at the idle deadline without a network polling loop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { client, upstream } = fixture();
    await client.restore();
    const cache = client.getSnapshot().cache!;
    cache.setQueryData(['private'], 'record');
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(client.getSnapshot().phase).toBe('signed-out');
    expect(cache.getQueryData(['private'])).toBeUndefined();
    expect(upstream.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/api/session',
      '/auth/logout',
    ]);
  });
  it('locks sign-in after automatic cleanup fails and permits an explicit cleanup retry', async () => {
    vi.useFakeTimers();
    const { client, upstream } = fixture(true);
    await client.restore();
    await vi.advanceTimersByTimeAsync(30 * 60_000);
    expect(client.getSnapshot().phase).toBe('cleanup-error');
    await client.signIn('test@example.com', 'synthetic-password');
    await client.restore();
    expect(upstream).toHaveBeenCalledTimes(2);
    upstream.mockImplementation(async () => Response.json({ signedIn: false }));
    await client.signOut();
    expect(client.getSnapshot().phase).toBe('signed-out');
  });
  it('does not revive an expired tab when timer execution was suspended', async () => {
    vi.useFakeTimers();
    const { client, upstream } = fixture();
    await client.restore();
    vi.setSystemTime(Date.now() + 31 * 60_000);
    await client.restore();
    expect(client.getSnapshot().phase).toBe('signed-out');
    expect(upstream.mock.calls.filter(([url]) => url.endsWith('/api/session'))).toHaveLength(1);
  });
  it('enforces the absolute deadline despite successful activity, including a zero clock origin', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const { client } = fixture();
    await client.restore();
    for (let step = 0; step < 47; step++) {
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      await client.read(
        'moderation_read',
        '/staff-workflow/inbox',
        {},
        (v) => v,
        new AbortController().signal,
      );
    }
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(client.getSnapshot().phase).toBe('signed-out');
  });
});
