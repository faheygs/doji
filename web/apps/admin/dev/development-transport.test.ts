// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { developmentTransport } from './development-transport';
import { localAdminOrigin } from './transport';

afterEach(() => vi.unstubAllGlobals());
function fixture() {
  vi.stubGlobal('location', { origin: localAdminOrigin });
  const requests: { name: string; args: Record<string, unknown> }[] = [];
  const upstream = vi.fn(async (_url: string, options: RequestInit) => {
    expect(options.credentials).toBe('same-origin');
    expect(options.headers).toMatchObject({ 'x-doji-csrf': 'synthetic' });
    if (options.method === 'GET')
      return Response.json({
        signedIn: true,
        assurance: 'staging_development',
        operator: { user_id: 'synthetic' },
      });
    const body = JSON.parse(String(options.body));
    requests.push(body);
    return Response.json(
      body.name === 'portal_sign_evidence_v1'
        ? { signedUrl: 'https://staging.invalid/signed', expiresIn: 300 }
        : { keyName: 'eVKl2g.synthetic' },
    );
  });
  vi.stubGlobal('fetch', upstream);
  const invalidated = vi.fn();
  const transport = developmentTransport('synthetic')({
    independentEmployeeIdentity: true,
    onAccessInvalidated: invalidated,
  });
  return { transport, requests, upstream, invalidated };
}
it('signs media and requests realtime only after a fresh local persona session', async () => {
  const f = fixture();
  await expect(f.transport.signEvidence('avatars', 'a.jpg')).rejects.toMatchObject({ status: 401 });
  expect(f.upstream).not.toHaveBeenCalled();
  await f.transport.session();
  expect(await f.transport.signEvidence('avatars', 'a.jpg')).toBe('https://staging.invalid/signed');
  expect(await f.transport.signEvidence('', '')).toBeNull();
  await f.transport.request('/staff-workflow/channels', { method: 'POST' });
  await expect(f.transport.request('/portal/admin/realtime-token')).resolves.toEqual({
    keyName: 'eVKl2g.synthetic',
  });
  expect(f.requests).toEqual([
    { name: 'portal_sign_evidence_v1', args: { bucket: 'avatars', path: 'a.jpg' } },
    { name: 'get_admin_staff_event_channels_v1', args: {} },
    { name: 'portal_realtime_token_v1', args: {} },
  ]);
});
it('does not release late media after persona lock or retry a denied resource', async () => {
  const f = fixture();
  await f.transport.session();
  let release!: (response: Response) => void;
  f.upstream.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = expect(f.transport.signEvidence('avatars', 'a.jpg')).rejects.toMatchObject({
    status: 401,
  });
  await vi.waitFor(() => expect(release).toBeTypeOf('function'));
  f.transport.clearSession({ revoke: false });
  release(Response.json({ signedUrl: 'https://staging.invalid/stale' }));
  await pending;
  await f.transport.session();
  f.upstream.mockResolvedValueOnce(Response.json({ message: 'Revoked' }, { status: 401 }));
  await expect(f.transport.request('/portal/admin/realtime-token')).rejects.toMatchObject({
    status: 401,
  });
  expect(f.invalidated).toHaveBeenCalledTimes(1);
  expect(f.transport.hasSession()).toBe(false);
  expect(f.upstream).toHaveBeenCalledTimes(4);
});
it('rejects malformed resource responses without converting them to missing evidence', async () => {
  const f = fixture();
  await f.transport.session();
  f.upstream.mockResolvedValueOnce(Response.json({}));
  await expect(f.transport.signEvidence('avatars', 'a.jpg')).rejects.toMatchObject({ status: 503 });
  expect(f.transport.hasSession()).toBe(true);
});
