import { createHash, webcrypto } from 'node:crypto';
import { moderationStorage } from '../../supabase/functions/_shared/moderation-media-storage';
import { createMediaCleanupClient } from '../../supabase/functions/_shared/moderation-media-cleanup-client';
import type { MediaObject } from '../../supabase/functions/_shared/moderation-media';

jest.mock('npm:@noble/hashes@1.8.0/sha256', () => jest.requireActual('@noble/hashes/sha256'), {
  virtual: true,
});
const origin = 'https://synthetic.invalid';
const source: MediaObject = { bucket: 'avatars', path: 'member/photo.png' };
const archive: MediaObject = { bucket: 'moderation-evidence', path: 'case/original' };
const probe = (object = source) => ({
  signedPath: `/object/sign/${object.bucket}/${object.path}?token=synthetic_token.sig`,
  expiresAt: new Date(Date.now() + 3600000).toISOString(),
});
const metadata = {
  bucket_id: source.bucket,
  name: source.path,
  id: 'identity',
  version: 'one',
  size: 4,
  content_type: 'image/png',
};
const transport = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
beforeAll(() =>
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto }),
);
beforeEach(() => transport.mockReset().mockImplementation(async () => Response.json({})));
afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});
afterAll(() => {
  if (descriptor) Object.defineProperty(globalThis, 'crypto', descriptor);
  else Reflect.deleteProperty(globalThis, 'crypto');
});
const port = (url = origin) => moderationStorage(url, 'sb_secret_synthetic', transport);

describe('service-only storage boundary', () => {
  test.each([
    'https://synthetic.invalid/path',
    'https://synthetic.invalid/?query=x',
    'https://synthetic.invalid/#x',
    'https://user@synthetic.invalid',
    'https://user:password@synthetic.invalid',
    'http://synthetic.invalid',
    'ftp://127.0.0.1',
  ])('rejects unsafe origin %s', (url) => {
    expect(() => port(url)).toThrow('invalid_storage_origin');
    expect(transport).not.toHaveBeenCalled();
  });
  test.each([origin, 'http://127.0.0.1:54321'])(
    'accepts configured origin %s and bounded service headers',
    async (url) => {
      transport.mockResolvedValue(Response.json(metadata));
      expect(await port(url).inspect(source)).toEqual({
        id: 'identity',
        version: 'one',
        size: 4,
        mime: 'image/png',
      });
      expect(transport).toHaveBeenCalledWith(
        `${url}/storage/v1/object/info/authenticated/avatars/member/photo.png`,
        expect.objectContaining({
          headers: { apikey: 'sb_secret_synthetic', 'content-type': 'application/json' },
          redirect: 'error',
          signal: expect.any(AbortSignal),
        }),
      );
    },
  );
  test.each(['', '/x', 'x/', '../x', 'x//y', 'a b', 'a?token=x', 'x'.repeat(1025)])(
    'rejects path %s',
    async (path) => {
      await expect(port().inspect({ ...source, path })).rejects.toThrow('invalid_storage_path');
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test('rejects unknown bucket', async () => {
    await expect(
      port().inspect({ ...source, bucket: 'private' as MediaObject['bucket'] }),
    ).rejects.toThrow('invalid_storage_path');
  });
  test('sanitizes transport errors', async () => {
    transport.mockRejectedValue(new Error('provider private URL'));
    await expect(port().inspect(source)).rejects.toThrow('storage_unavailable');
  });
  test.each([400, 404])('recognizes exact NoSuchKey absence for %i', async (status) => {
    transport.mockResolvedValue(Response.json({ code: 'NoSuchKey' }, { status }));
    await expect(port().inspect(source)).resolves.toBeNull();
  });
  test.each([400, 401, 403, 404, 500])('does not treat arbitrary %i as absence', async (status) => {
    transport.mockResolvedValue(Response.json({ code: 'Forbidden' }, { status }));
    await expect(port().inspect(source)).rejects.toThrow('storage_inspection_failed');
  });
  test.each([
    { bucket_id: 'other' },
    { name: 'other' },
    { id: null },
    { version: null },
    { size: 0 },
    { size: 1.5 },
    { content_type: null },
  ])('rejects untrusted metadata %j', async (patch) => {
    transport.mockResolvedValue(Response.json({ ...metadata, ...patch }));
    await expect(port().inspect(source)).rejects.toThrow('invalid_storage_metadata');
  });
  test('rejects unparseable metadata', async () => {
    transport.mockResolvedValue(new Response('not json'));
    await expect(port().inspect(source)).rejects.toThrow('invalid_storage_metadata');
  });
  test.each([{ id: 'moderation-evidence', public: true }, { id: 'other', public: false }, null])(
    'requires exact private evidence bucket %j',
    async (body) => {
      transport.mockResolvedValue(Response.json(body));
      await expect(port().assertPrivateEvidence()).rejects.toThrow('evidence_bucket_not_private');
    },
  );
  test.each([200, 403])('bucket inspection status %i is authoritative', async (status) => {
    transport.mockResolvedValue(
      Response.json({ id: 'moderation-evidence', public: false }, { status }),
    );
    if (status === 200) await expect(port().assertPrivateEvidence()).resolves.toBeUndefined();
    else
      await expect(port().assertPrivateEvidence()).rejects.toThrow('evidence_bucket_not_private');
  });
  test('malformed bucket response is rejected', async () => {
    transport.mockResolvedValue(new Response('not json'));
    await expect(port().assertPrivateEvidence()).rejects.toThrow('evidence_bucket_not_private');
  });
  test.each([0, -1, 1.5, Infinity, 100 * 1024 ** 2 + 1])(
    'rejects read bound %s before fetching',
    async (limit) => {
      await expect(port().digest(source, limit)).rejects.toThrow('invalid_read_bound');
      expect(transport).not.toHaveBeenCalled();
    },
  );
  test('hashes multiple binary chunks with a bounded streaming reader', async () => {
    const bytes = new Uint8Array([0, 1, 128, 255]);
    transport.mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(bytes.slice(0, 2));
            c.enqueue(bytes.slice(2));
            c.close();
          },
        }),
      ),
    );
    await expect(port().digest(source, 4)).resolves.toEqual({
      size: 4,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(transport.mock.calls[0][0]).toMatch(
      /\/object\/authenticated\/avatars\/member\/photo.png\?cacheNonce=/,
    );
  });
  test.each(['oversize', 'empty', 'interrupted', 'http'])(
    'bounded digest handles %s',
    async (mode) => {
      if (mode === 'oversize') transport.mockResolvedValue(new Response('12345'));
      if (mode === 'empty') transport.mockResolvedValue(new Response(null));
      if (mode === 'interrupted')
        transport.mockResolvedValue(
          new Response(
            new ReadableStream({
              start(c) {
                c.error(new Error('private provider detail'));
              },
            }),
          ),
        );
      if (mode === 'http') transport.mockResolvedValue(new Response('no', { status: 503 }));
      await expect(port().digest(source, 4)).rejects.toThrow(
        {
          oversize: 'object_too_large',
          empty: 'empty_storage_body',
          interrupted: 'storage_read_interrupted',
          http: 'storage_request_failed',
        }[mode],
      );
    },
  );
  test.each([
    [source, archive],
    [archive, source],
  ])('copies only between evidence and origin: %j', async (from, to) => {
    transport.mockResolvedValue(new Response(null));
    await port().copy(from, to);
    const [, init] = transport.mock.calls[0];
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      bucketId: from.bucket,
      sourceKey: from.path,
      destinationBucket: to.bucket,
      destinationKey: to.path,
    });
    expect(new Headers(init?.headers).has('x-upsert')).toBe(false);
  });
  test.each([
    [source, source],
    [archive, archive],
  ])('forbids copy direction %j', async (from, to) => {
    await expect(port().copy(from, to)).rejects.toThrow('invalid_copy_direction');
    expect(transport).not.toHaveBeenCalled();
  });
  test('deletes only exact prefixes and cannot delete evidence', async () => {
    await port().remove(source);
    expect(JSON.parse(transport.mock.calls[0][1]?.body as string)).toEqual({
      prefixes: [source.path],
    });
    await expect(port().remove(archive)).rejects.toThrow('evidence_deletion_forbidden');
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test.each(['copy', 'remove'] as const)('cancels failed %s response', async (operation) => {
    const cancel = jest.fn();
    transport.mockResolvedValue(new Response(new ReadableStream({ cancel }), { status: 500 }));
    await expect(
      operation === 'copy' ? port().copy(source, archive) : port().remove(source),
    ).rejects.toThrow('storage_request_failed');
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});

describe('actual client-URL revocation proof', () => {
  test.each(['avatars', 'post-media'] as const)(
    'prepares %s probe without leaking service credentials to observation URLs',
    async (bucket) => {
      const object = { ...source, bucket };
      const expected = probe(object);
      transport
        .mockResolvedValueOnce(Response.json({ signedURL: expected.signedPath }))
        .mockImplementation(async () => new Response('x'));
      const actual = await port().prepareAccessProbe(object);
      expect(actual.signedPath).toBe(expected.signedPath);
      expect(Date.parse(actual.expiresAt) - Date.now()).toBeGreaterThan(86300000);
      expect(JSON.parse(transport.mock.calls[0][1]?.body as string)).toEqual({ expiresIn: 86400 });
      expect(transport).toHaveBeenCalledTimes(bucket === 'avatars' ? 3 : 2);
      for (const [, init] of transport.mock.calls.slice(1))
        expect(init).toMatchObject({
          headers: { range: 'bytes=0-0' },
          redirect: 'error',
          signal: expect.any(AbortSignal),
        });
    },
  );
  test('cannot prepare an evidence probe', async () => {
    await expect(port().prepareAccessProbe(archive)).rejects.toThrow('invalid_access_probe');
    expect(transport).not.toHaveBeenCalled();
  });
  test.each(['http', 'missing', 'network', 'unavailable'])(
    'preparation fails safely on %s',
    async (failure) => {
      transport.mockResolvedValueOnce(
        failure === 'http'
          ? new Response(null, { status: 500 })
          : Response.json(failure === 'missing' ? {} : { signedURL: probe().signedPath }),
      );
      if (failure === 'network') transport.mockRejectedValueOnce(new Error('network'));
      else transport.mockResolvedValue(new Response(null, { status: 403 }));
      await expect(port().prepareAccessProbe(source)).rejects.toThrow(
        {
          http: 'storage_request_failed',
          missing: 'invalid_access_probe',
          network: 'storage_unavailable',
          unavailable: 'access_probe_unavailable',
        }[failure],
      );
    },
  );
  test.each([
    { signedPath: undefined },
    { signedPath: '/object/sign/avatars/other?token=x' },
    { signedPath: `${probe().signedPath}&extra=x` },
    { signedPath: `/object/sign/avatars/${source.path}?token=` },
    { signedPath: `${probe().signedPath}${'a'.repeat(8192)}` },
    { expiresAt: 'invalid' },
  ])('rejects invalid probe %j', async (patch) => {
    await expect(
      port().verifyAccessProbe(source, { ...probe(), ...patch } as ReturnType<typeof probe>),
    ).rejects.toThrow('invalid_access_probe');
    expect(transport).not.toHaveBeenCalled();
  });
  test('rejects evidence probe even if structurally valid', async () => {
    await expect(port().verifyAccessProbe(archive, probe(archive))).rejects.toThrow(
      'invalid_access_probe',
    );
  });
  test('expired probe cannot establish revocation', async () => {
    await expect(
      port().verifyAccessProbe(source, {
        ...probe(),
        expiresAt: new Date(Date.now() + 30000).toISOString(),
      }),
    ).rejects.toThrow('access_probe_expired');
  });
  test.each([
    { code: 'NoSuchKey' },
    { error: 'not_found', statusCode: 404, message: 'Object not found' },
  ])('accepts precise absence proof %j for both client URL forms', async (body) => {
    transport.mockImplementation(async () => Response.json(body, { status: 404 }));
    await expect(port().verifyAccessProbe(source, probe())).resolves.toBeUndefined();
    expect(transport).toHaveBeenCalledTimes(2);
  });
  test('post media uses only signed URL proof', async () => {
    const object: MediaObject = { ...source, bucket: 'post-media' };
    transport.mockResolvedValue(Response.json({ code: 'NoSuchKey' }, { status: 400 }));
    await port().verifyAccessProbe(object, probe(object));
    expect(transport).toHaveBeenCalledTimes(1);
  });
  test.each([200, 401, 403, 500])('status %i cannot prove revocation', async (status) => {
    transport.mockResolvedValue(Response.json({ code: 'NoSuchKey' }, { status }));
    await expect(port().verifyAccessProbe(source, probe())).rejects.toThrow('access_not_revoked');
  });
  test.each([
    null,
    {},
    { error: 'wrong' },
    { error: 'not_found', statusCode: 400 },
    { error: 'not_found', statusCode: 404 },
    { error: 'not_found', statusCode: 404, message: 'Bucket not found' },
  ])('proxy/auth/missing-bucket response is not object absence %j', async (body) => {
    transport.mockResolvedValue(Response.json(body, { status: 404 }));
    await expect(port().verifyAccessProbe(source, probe())).rejects.toThrow('access_not_revoked');
  });
  test.each([null, 'not JSON', 'x'.repeat(4097)])(
    'empty/malformed/oversized proof is rejected',
    async (body) => {
      transport.mockResolvedValue(new Response(body, { status: 404 }));
      await expect(port().verifyAccessProbe(source, probe())).rejects.toThrow('access_not_revoked');
    },
  );
});

describe('cleanup client shared deadline and object budget', () => {
  function setup(maximum = 20, ms = 45000) {
    transport.mockImplementation(async (url, init) => {
      if (String(url).includes('/rpc/claim_media_cleanup_v1')) {
        const { p_paths } = JSON.parse(init?.body as string);
        return Response.json(
          p_paths[0] === 'held/file' ? [] : [{ path: p_paths[0], state: 'complete' }],
        );
      }
      return Response.json({ code: 'NoSuchKey' }, { status: 404 });
    });
    return createMediaCleanupClient(origin, 'sb_secret_synthetic', transport, ms, maximum);
  }
  test('budget counts completed objects only and leaves unstarted work unclaimed', async () => {
    const client = setup(1);
    expect(client.available()).toBe(true);
    await expect(
      client.remove('avatars', ['held/file', 'member/a', 'member/a', 'member/b']),
    ).resolves.toEqual({ completed: ['member/a'], deferred: ['held/file', 'member/b'] });
    expect(client.available()).toBe(false);
    expect(transport).toHaveBeenCalledTimes(3);
    await expect(client.remove('avatars', ['member/b'])).resolves.toEqual({
      completed: [],
      deferred: ['member/b'],
    });
    expect(transport).toHaveBeenCalledTimes(3);
  });
  test('deadline stops subsequent claims', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const client = setup();
    jest.spyOn(Date, 'now').mockReturnValue(now + 45001);
    expect(client.available()).toBe(false);
    await expect(client.remove('avatars', ['member/a'])).resolves.toEqual({
      completed: [],
      deferred: ['member/a'],
    });
    expect(transport).not.toHaveBeenCalled();
  });
  test('bounded fetch preserves caller cancellation and supplies its own deadline', async () => {
    const client = setup();
    const c = new AbortController();
    c.abort();
    await client.fetch('https://synthetic.invalid/read', { signal: c.signal });
    expect(transport.mock.calls[0][1]?.signal?.aborted).toBe(true);
    await client.fetch('https://synthetic.invalid/read');
    expect(transport.mock.calls[1][1]?.signal).toBeInstanceOf(AbortSignal);
  });
  test.each(['network', 'http'])(
    'sanitizes cleanup RPC %s failure without retrying',
    async (mode) => {
      const client = setup();
      if (mode === 'network') transport.mockRejectedValue(new Error('private detail'));
      else transport.mockResolvedValue(new Response('private detail', { status: 503 }));
      await expect(client.remove('avatars', ['member/a'])).rejects.toThrow(
        'Cleanup database unavailable',
      );
      expect(transport).toHaveBeenCalledTimes(1);
    },
  );
  test('default parameters allow a bounded complete request', async () => {
    setup();
    const client = createMediaCleanupClient(origin, 'legacy-synthetic', transport);
    await expect(client.remove('post-media', ['member/a'])).resolves.toEqual({
      completed: ['member/a'],
      deferred: [],
    });
    expect(transport.mock.calls[0][1]).toMatchObject({
      redirect: 'error',
      headers: { authorization: 'Bearer legacy-synthetic' },
    });
  });
});
