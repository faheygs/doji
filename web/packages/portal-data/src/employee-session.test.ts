import { describe, expect, it, vi } from 'vitest';
import { createEmployeeSession } from './employee-session';

const id = '10000000-0000-4000-8000-000000000001';
const employee = {
  user_id: id,
  display_name: 'Test employee',
  capabilities: { moderation_read: true },
};
const authenticated = (op = employee) => ({
  signedIn: true,
  assurance: 'aal2',
  csrf: 'c'.repeat(43),
  operator: op,
});
function fixture(handler: (url: string, init?: RequestInit) => Promise<Response>) {
  const upstream = vi.fn(handler);
  return {
    upstream,
    client: createEmployeeSession(
      { independentEmployeeIdentity: true, staffWorkflowEnabled: true },
      { origin: 'https://admin.dojipro.com', upstream },
    ),
  };
}
describe('employee React session boundary', () => {
  it('keeps the exact production origin guard', () => {
    expect(() =>
      createEmployeeSession(
        { independentEmployeeIdentity: true },
        { origin: 'http://127.0.0.1:4310' },
      ),
    ).toThrow();
  });
  it('coalesces restore and exposes no CSRF or browser credentials', async () => {
    const { client, upstream } = fixture(async () => Response.json(authenticated()));
    await Promise.all([client.restore(), client.restore()]);
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(client.getSnapshot().phase).toBe('ready');
    expect(JSON.stringify(client.getSnapshot())).not.toContain('c'.repeat(43));
  });
  it('preserves cache for the same authorization and replaces it on capability changes', async () => {
    let op = employee;
    const { client } = fixture(async () => Response.json(authenticated(op)));
    await client.restore();
    const cache = client.getSnapshot().cache!;
    cache.setQueryData(['private'], 'record');
    await client.restore();
    expect(client.getSnapshot().cache).toBe(cache);
    op = { ...employee, capabilities: { moderation_read: false } };
    await client.restore();
    expect(cache.getQueryData(['private'])).toBeUndefined();
    expect(client.getSnapshot().cache).not.toBe(cache);
  });
  it('rejects denied reads before dispatch and clears cache immediately on logout', async () => {
    const { client, upstream } = fixture(async (url) =>
      Response.json(url.endsWith('/auth/logout') ? { signedIn: false } : authenticated()),
    );
    await client.restore();
    const cache = client.getSnapshot().cache!;
    cache.setQueryData(['private'], 'record');
    await expect(
      client.read(
        'legal_read',
        '/staff-workflow/safety',
        {},
        (x) => x,
        new AbortController().signal,
      ),
    ).rejects.toThrow('permission');
    expect(upstream).toHaveBeenCalledTimes(1);
    const done = client.signOut();
    expect(client.getSnapshot().operator).toBeNull();
    expect(cache.getQueryData(['private'])).toBeUndefined();
    await done;
  });
  it('fences a late read after logout and never retries it', async () => {
    let release!: (response: Response) => void;
    const { client, upstream } = fixture(async (url) =>
      url.endsWith('/api/rpc')
        ? new Promise((resolve) => {
            release = resolve;
          })
        : Response.json(url.endsWith('/auth/logout') ? { signedIn: false } : authenticated()),
    );
    await client.restore();
    const result = client.read(
      'moderation_read',
      '/staff-workflow/inbox',
      {},
      (x) => x,
      new AbortController().signal,
    );
    const rejected = expect(result).rejects.toThrow();
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    const logout = client.signOut();
    release(Response.json({ private: 'old record' }));
    await rejected;
    await logout;
    expect(client.getSnapshot().phase).toBe('signed-out');
    expect(upstream.mock.calls.filter(([url]) => url.endsWith('/api/rpc'))).toHaveLength(1);
  });
  it('does not treat unavailable or malformed authorization as an empty workspace', async () => {
    const { client } = fixture(async () => Response.json({ signedIn: true }));
    await client.restore();
    expect(client.getSnapshot().phase).not.toBe('ready');
    expect(client.getSnapshot().cache).toBeNull();
  });
  it('rechecks changed permissions after a denied read without retrying the request', async () => {
    let op = employee;
    const { client, upstream } = fixture(async (url) => {
      if (url.endsWith('/api/rpc')) {
        op = { ...employee, capabilities: { moderation_read: false } };
        return Response.json({ message: 'Permission denied' }, { status: 403 });
      }
      return Response.json(authenticated(op));
    });
    await client.restore();
    const cache = client.getSnapshot().cache!;
    cache.setQueryData(['private'], 'old record');
    await expect(
      client.read(
        'moderation_read',
        '/staff-workflow/inbox',
        {},
        (value) => value,
        new AbortController().signal,
      ),
    ).rejects.toThrow('Permission denied');
    expect(client.getSnapshot().operator?.capabilities.moderation_read).toBe(false);
    expect(cache.getQueryData(['private'])).toBeUndefined();
    expect(upstream.mock.calls.filter(([url]) => url.endsWith('/api/rpc'))).toHaveLength(1);
  });
});
