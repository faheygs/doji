import { moderationMediaDispatch } from '../../supabase/functions/_shared/moderation-media-dispatch';
import {
  MediaFailure,
  type MediaPort,
  type RemovalJob,
} from '../../supabase/functions/_shared/moderation-media';
jest.mock('npm:@noble/hashes@1.8.0/sha256', () => jest.requireActual('@noble/hashes/sha256'), {
  virtual: true,
});
const id = '11111111-1111-4111-8111-111111111111';
const identity = { id, version: 'one', size: 4, mime: 'image/png' };
const digest = { sha256: 'a'.repeat(64), size: 4 };
const probe = {
  signedPath: '/object/sign/avatars/member/a?token=synthetic',
  expiresAt: '2030-01-01T00:00:00Z',
};
const environment = {
  enabled: true,
  secret: 'synthetic',
  serviceKey: 'sb_secret_synthetic',
  supabaseUrl: 'https://synthetic.invalid/',
};
const request = (method = 'POST', auth = 'Bearer synthetic') =>
  new Request('https://synthetic.invalid/dispatch', { method, headers: { authorization: auth } });
type Job = RemovalJob & {
  lease_id: string;
  revision: number;
  operation?: string;
  access_probe?: typeof probe;
};
function setup(operation: string | undefined = 'remove', archived = true) {
  const job: Job = {
    id,
    source: { bucket: 'avatars', path: 'member/a' },
    evidence: { bucket: 'moderation-evidence', path: `${id}/original` },
    original: identity,
    archived: archived ? { ...digest, evidenceIdentity: identity } : null,
    lease_id: id,
    revision: 2,
    operation,
    access_probe: probe,
  };
  const objects = new Map([
    [job.source.path, identity],
    [job.evidence.path, identity],
  ]);
  const port = {
    assertPrivateEvidence: jest.fn(async () => {}),
    inspect: jest.fn(async (o: { path: string }) => objects.get(o.path) ?? null),
    digest: jest.fn(async () => digest),
    copy: jest.fn(async (_s: unknown, d: { path: string }) => {
      objects.set(d.path, identity);
    }),
    remove: jest.fn(async (o: { path: string }) => {
      objects.delete(o.path);
    }),
    prepareAccessProbe: jest.fn(async () => probe),
    verifyAccessProbe: jest.fn(async () => {}),
  } satisfies MediaPort;
  const transport = jest
    .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
    .mockImplementation(async (url) =>
      Response.json(String(url).endsWith('/claim_moderation_media_v1') ? job : true),
    );
  const run = () => moderationMediaDispatch(request(), environment, transport, port);
  const rpc = (name: string) =>
    transport.mock.calls
      .filter(([url]) => String(url).endsWith(`/${name}`))
      .map(([, init]) => JSON.parse(init?.body as string));
  return { job, objects, port, transport, run, rpc };
}
test.each([
  [{ ...environment, enabled: false }, request(), 503],
  [{ ...environment, secret: '' }, request(), 401],
  [environment, request('POST', 'Bearer incorrect'), 401],
  [environment, request('GET'), 405],
  [{ ...environment, serviceKey: '' }, request(), 503],
  [{ ...environment, supabaseUrl: '' }, request(), 503],
])('dispatcher gates requests before claiming work', async (env, req, status) => {
  const s = setup();
  const response = await moderationMediaDispatch(
    req as Request,
    env as typeof environment,
    s.transport,
    s.port,
  );
  expect(response.status).toBe(status);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(s.transport).not.toHaveBeenCalled();
});
test('empty queue has no side effects', async () => {
  const s = setup();
  s.transport.mockResolvedValue(Response.json(null));
  const res = await s.run();
  expect(await res.json()).toEqual({ claimed: 0 });
  expect(s.port.inspect).not.toHaveBeenCalled();
});
test.each(['http', 'transport', 'json'])(
  'claim %s failure returns generic failure without a guessed job',
  async (kind) => {
    const s = setup();
    if (kind === 'transport') s.transport.mockRejectedValue(new Error('private detail'));
    else
      s.transport.mockResolvedValue(
        new Response('private detail', { status: kind === 'http' ? 500 : 200 }),
      );
    const res = await s.run();
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain('private detail');
    expect(s.transport).toHaveBeenCalledTimes(1);
  },
);
test.each([
  { lease_id: 'bad' },
  { revision: 0 },
  { revision: 1.5 },
  { operation: 'unknown' },
  { id: 'bad' },
])('rejects invalid claimed job %j', async (patch) => {
  const s = setup();
  Object.assign(s.job, patch);
  expect((await s.run()).status).toBe(503);
  expect(s.rpc('fail_moderation_media_v1')[0]).toMatchObject({
    p_code: 'invalid_job',
    p_terminal: true,
  });
  expect(s.port.remove).not.toHaveBeenCalled();
});
test.each([undefined, 'remove'])(
  'removal %s persists origin deletion without claiming CDN revocation',
  async (operation) => {
    const s = setup(operation);
    const response = await s.run();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      claimed: 1,
      state: 'origin_removed',
      revocation_verified: false,
    });
    expect(s.rpc('finish_moderation_media_origin_v1')).toEqual([
      { p_id: id, p_lease: id, p_revision: 2 },
    ]);
    expect(s.port.prepareAccessProbe).not.toHaveBeenCalled();
    expect(s.port.verifyAccessProbe).not.toHaveBeenCalled();
    for (const [, init] of s.transport.mock.calls)
      expect(init).toMatchObject({
        redirect: 'error',
        signal: expect.any(AbortSignal),
        headers: { apikey: 'sb_secret_synthetic' },
      });
  },
);
test('new removal persists access probe and archive before deleting', async () => {
  const s = setup('remove', false);
  delete s.job.access_probe;
  s.objects.delete(s.job.evidence.path);
  expect((await s.run()).status).toBe(200);
  expect(s.rpc('save_moderation_media_probe_v1')[0]).toMatchObject({ p_probe: probe });
  expect(s.rpc('save_moderation_media_archive_v1')[0]).toMatchObject({
    p_proof: { ...digest, evidenceIdentity: identity },
  });
  expect(s.port.copy).toHaveBeenCalledWith(s.job.source, s.job.evidence);
});
test('stale acknowledgement aborts with retryable generic code', async () => {
  const s = setup();
  s.transport.mockImplementation(async (url) =>
    Response.json(String(url).endsWith('/claim_moderation_media_v1') ? s.job : false),
  );
  expect((await s.run()).status).toBe(503);
  expect(s.rpc('fail_moderation_media_v1')[0]).toMatchObject({
    p_code: 'unknown',
    p_terminal: false,
  });
  expect(s.port.remove).not.toHaveBeenCalled();
});
test.each([
  'storage_unavailable',
  'storage_request_failed',
  'storage_inspection_failed',
  'storage_read_interrupted',
  'source_still_present',
  'access_probe_unavailable',
  'access_not_revoked',
  'source_changed',
  'archive_changed',
  'object_too_large',
  'evidence_bucket_not_private',
  'invalid_access_probe',
  'access_probe_expired',
  'unrecognized-private-value',
])('persists bounded classified failure %s', async (code) => {
  const s = setup();
  s.port.assertPrivateEvidence.mockRejectedValue(new MediaFailure(code));
  expect((await s.run()).status).toBe(503);
  const normalized = code === 'unrecognized-private-value' ? 'unknown' : code;
  const retryable = [
    'unknown',
    'storage_unavailable',
    'storage_request_failed',
    'storage_inspection_failed',
    'storage_read_interrupted',
    'source_still_present',
    'access_probe_unavailable',
    'access_not_revoked',
  ].includes(normalized);
  expect(s.rpc('fail_moderation_media_v1')).toEqual([
    { p_id: id, p_lease: id, p_revision: 2, p_code: normalized, p_terminal: !retryable },
  ]);
});
test('failure-record network error leaves lease recovery and never returns success', async () => {
  const s = setup();
  s.port.assertPrivateEvidence.mockRejectedValue(new Error('private diagnostic'));
  s.transport.mockImplementation(async (url) => {
    if (String(url).endsWith('/fail_moderation_media_v1')) throw new Error('database');
    return Response.json(s.job);
  });
  const response = await s.run();
  expect(response.status).toBe(503);
  expect(await response.text()).not.toMatch(/private diagnostic|database/);
});
test.each([true, false])('restoration cancellation supports source present=%s', async (present) => {
  const s = setup('cancel_restore');
  if (!present) s.objects.delete(s.job.source.path);
  expect(await (await s.run()).json()).toEqual({ claimed: 1, state: 'restoration_cancelled' });
  expect(s.rpc('finish_cancelled_media_restore_v1')[0]).toMatchObject({
    p_identity: present ? identity : null,
  });
  expect(s.port.remove).not.toHaveBeenCalled();
});
test('cancels restoration of untouched source before archival', async () => {
  const s = setup('cancel_restore', false);
  expect((await s.run()).status).toBe(200);
  expect(s.port.digest).not.toHaveBeenCalled();
});
test.each([{ id: 'other' }, { version: 'other' }, { size: 5 }, { mime: 'other' }])(
  'untouched cancellation rejects replacement %j',
  async (patch) => {
    const s = setup('cancel_restore', false);
    s.objects.set(s.job.source.path, { ...identity, ...patch });
    expect((await s.run()).status).toBe(503);
    expect(s.rpc('fail_moderation_media_v1')[0]).toMatchObject({
      p_code: 'restore_conflict',
      p_terminal: true,
    });
  },
);
test.each([{ sha256: 'b'.repeat(64) }, { size: 3 }])(
  'archived cancellation rejects mismatched bytes %j',
  async (patch) => {
    const s = setup('cancel_restore');
    s.port.digest.mockResolvedValue({ ...digest, ...patch });
    expect((await s.run()).status).toBe(503);
    expect(s.rpc('finish_cancelled_media_restore_v1')).toHaveLength(0);
  },
);
test('restoration publishes only a verified exact identity', async () => {
  const s = setup('restore');
  s.objects.delete(s.job.source.path);
  expect(await (await s.run()).json()).toEqual({ claimed: 1, state: 'restored' });
  expect(s.rpc('finish_moderation_media_restore_v1')[0]).toMatchObject({ p_identity: identity });
  expect(s.port.copy).toHaveBeenCalledWith(s.job.evidence, s.job.source);
});
test.each(['archive', 'probe'])(
  'revocation verification requires persisted %s',
  async (missing) => {
    const s = setup('verify');
    if (missing === 'archive') s.job.archived = null;
    else delete s.job.access_probe;
    expect((await s.run()).status).toBe(503);
    expect(s.rpc('fail_moderation_media_v1')[0]).toMatchObject({ p_code: 'invalid_access_probe' });
  },
);
test.each([
  null,
  { ...identity, id: 'other' },
  { ...identity, version: 'other' },
  { ...identity, size: 5 },
  { ...identity, mime: 'other' },
])('verification rejects changed archive %j', async (value) => {
  const s = setup('verify');
  if (value) s.objects.set(s.job.evidence.path, value);
  else s.objects.delete(s.job.evidence.path);
  expect((await s.run()).status).toBe(503);
  expect(s.rpc('fail_moderation_media_v1')[0]).toMatchObject({ p_code: 'archive_changed' });
  expect(s.port.verifyAccessProbe).not.toHaveBeenCalled();
});
test('verification rejects origin still present', async () => {
  const s = setup('verify');
  expect((await s.run()).status).toBe(503);
  expect(s.rpc('fail_moderation_media_v1')[0]).toMatchObject({
    p_code: 'source_still_present',
    p_terminal: false,
  });
});
test('verification checks old client URL before finishing revocation', async () => {
  const s = setup('verify');
  s.objects.delete(s.job.source.path);
  expect(await (await s.run()).json()).toEqual({
    claimed: 1,
    state: 'revoked',
    revocation_verified: true,
  });
  expect(s.port.verifyAccessProbe).toHaveBeenCalledWith(s.job.source, probe);
  expect(s.rpc('finish_moderation_media_revocation_v1')).toHaveLength(1);
});
test('default storage adapter is used when no injected port is given', async () => {
  const s = setup('cancel_restore', false);
  s.transport.mockImplementation(async (url) =>
    Response.json(
      String(url).includes('/storage/')
        ? { code: 'NoSuchKey' }
        : String(url).endsWith('/claim_moderation_media_v1')
          ? s.job
          : true,
      { status: String(url).includes('/storage/') ? 404 : 200 },
    ),
  );
  expect((await moderationMediaDispatch(request(), environment, s.transport)).status).toBe(200);
  expect(
    s.transport.mock.calls.some(([url]) =>
      String(url).includes('/storage/v1/object/info/authenticated/avatars/member/a'),
    ),
  ).toBe(true);
});
