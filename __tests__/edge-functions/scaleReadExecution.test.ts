jest.mock('../../infra/doji-orchestrator/src/scale-read-auth', () => ({
  authenticateScaleReadRequest: jest.fn(),
  normalizedSupabaseUrl: (env: { SUPABASE_URL: string }) => env.SUPABASE_URL.replace(/\/$/, ''),
}));
import { handleScaleRead, routeFor } from '../../infra/doji-orchestrator/src/scale-read';
import { authenticateScaleReadRequest } from '../../infra/doji-orchestrator/src/scale-read-auth';
const originalFetch = global.fetch;
const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
const transport = jest.fn();
const match = jest.fn();
const put = jest.fn();
const env = { SUPABASE_URL: 'https://database.invalid/', SUPABASE_ANON_KEY: 'synthetic' };
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
let sequence = 0;
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = transport;
  transport.mockReset().mockImplementation(async () => Response.json({ value: true }));
  match.mockReset().mockResolvedValue(undefined);
  put.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: { default: { match, put } },
  });
  jest
    .mocked(authenticateScaleReadRequest)
    .mockReset()
    .mockResolvedValue({ userId: `member-${++sequence}`, token: 'member-token', aal: 'aal1' });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
  else Reflect.deleteProperty(globalThis, 'caches');
  jest.restoreAllMocks();
});
const req = (path = '/v1/profiles/person', method = 'GET') =>
  new Request(`https://gateway.invalid${path}`, { method });
test('ignores non-member paths', async () =>
  expect(await handleScaleRead(req('/portal/admin/session'), env)).toBeNull());
test('rejects writes and unsupported reads without calling auth', async () => {
  expect((await handleScaleRead(req(undefined, 'POST'), env))?.status).toBe(405);
  expect((await handleScaleRead(req('/v1/not-found'), env))?.status).toBe(404);
  expect(authenticateScaleReadRequest).not.toHaveBeenCalled();
});
test.each([
  [
    `/v1/feed/${id}?unlocked=false&offset=2&limit=10`,
    'get_locked_feed_previews',
    { p_daily_event_ids: [id], p_audience: 'friends', p_limit: 10, p_offset: 2 },
  ],
  [
    `/v1/feed/${id}?beforeCreatedAt=2026-10-01T12:00:00Z&beforeId=${id}`,
    'get_feed_page_snapshot_v2',
    {
      p_daily_event_id: id,
      p_audience: 'friends',
      p_limit: 20,
      p_before_created_at: '2026-10-01T12:00:00Z',
      p_before_id: id,
    },
  ],
  [
    `/v1/posts/${id}/engagement`,
    'get_post_engagement_snapshot_v2',
    { p_post_id: id, p_audience: 'everyone' },
  ],
  [
    `/v1/polls/${id}/summary`,
    'get_poll_results_summary',
    { p_daily_event_id: id, p_audience: 'friends' },
  ],
  ['/v1/profiles/Person', 'get_public_profile_view', { p_username: 'person' }],
] as const)('routes %s to the exact authorized RPC', async (path, rpc, args) => {
  const result = await handleScaleRead(req(path), env);
  expect(result?.status).toBe(200);
  expect(await result?.json()).toEqual({ value: true });
  expect(transport).toHaveBeenCalledWith(
    `https://database.invalid/rest/v1/rpc/${rpc}`,
    expect.objectContaining({
      body: JSON.stringify(args),
      headers: expect.objectContaining({ authorization: 'Bearer member-token' }),
      signal: expect.any(AbortSignal),
    }),
  );
  expect(result?.headers.get('cache-control')).toBe('private, no-store');
  expect(result?.headers.get('x-doji-scale-cache')).toBe('miss');
  expect(put).toHaveBeenCalledTimes(1);
});
test.each([
  'audience=other',
  'limit=0',
  'limit=41',
  'limit=1.5',
  'unlocked=maybe',
  'beforeCreatedAt=no',
  'beforeId=bad',
  'unlocked=false&offset=-1',
  'unlocked=false&offset=10001',
])('invalid query %s cannot reach the provider', async (query) => {
  expect((await handleScaleRead(req(`/v1/feed/${id}?${query}`), env))?.status).toBe(400);
  expect(transport).not.toHaveBeenCalled();
});
test.each(['/v1/posts/aaa/engagement', '/v1/polls/aaa/summary', '/v1/feed/aaa'])(
  'invalid ID is not routed: %s',
  (path) => expect(routeFor(new URL(`https://gateway.invalid${path}`))).toBeNull(),
);
test.each([
  new Error('Authentication required'),
  new Error('Invalid query'),
  new Error('sensitive provider details'),
  'unknown',
])('failure classification is bounded (%s)', async (error) => {
  jest.mocked(authenticateScaleReadRequest).mockRejectedValue(error);
  const result = await handleScaleRead(req(), env);
  const expected =
    error instanceof Error && error.message.startsWith('Authentication')
      ? 401
      : error instanceof Error && error.message.startsWith('Invalid')
        ? 400
        : 503;
  expect(result?.status).toBe(expected);
  if (expected === 503) expect(await result?.json()).toEqual({ error: 'Scale read unavailable' });
});
test('cache hits are still authenticated and scoped by member, version and arguments', async () => {
  match.mockResolvedValue(Response.json({ cached: true }));
  const result = await handleScaleRead(req(), { ...env, SCALE_CACHE_VERSION: '  candidate  ' });
  expect(await result?.json()).toEqual({ cached: true });
  expect(result?.headers.get('x-doji-scale-cache')).toBe('hit');
  expect(match.mock.calls[0][0].url).toContain(`/candidate/member-${sequence}/profile?args=`);
  expect(authenticateScaleReadRequest).toHaveBeenCalledTimes(1);
  expect(transport).not.toHaveBeenCalled();
});
test('concurrent identical reads share origin work but retain separate response bodies', async () => {
  let finish!: (value: Response) => void;
  transport.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const first = handleScaleRead(req(), env);
  const second = handleScaleRead(req(), env);
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(transport).toHaveBeenCalledTimes(1);
  finish(Response.json({ shared: true }));
  const responses = await Promise.all([first, second]);
  expect(await Promise.all(responses.map((r) => r?.json()))).toEqual([
    { shared: true },
    { shared: true },
  ]);
});
test('failed inflight work is removed so an explicit retry can recover', async () => {
  transport.mockRejectedValueOnce(new Error('offline'));
  expect((await handleScaleRead(req(), env))?.status).toBe(503);
  expect((await handleScaleRead(req(), env))?.status).toBe(200);
  expect(transport).toHaveBeenCalledTimes(2);
});
test.each([403, 503])('upstream %i is preserved and never cached', async (status) => {
  transport.mockResolvedValue(new Response('{"error":"denied"}', { status }));
  const response = await handleScaleRead(req(), env);
  expect(response?.status).toBe(status);
  expect(put).not.toHaveBeenCalled();
});
test('empty successful upstream body becomes JSON null', async () => {
  transport.mockResolvedValue(new Response(''));
  expect(await (await handleScaleRead(req(), env))?.json()).toBeNull();
});
test('member request budget rejects the 241st request and resets after a minute', async () => {
  let now = 100000;
  jest.spyOn(Date, 'now').mockImplementation(() => now);
  match.mockImplementation(async () => Response.json({}));
  for (let i = 0; i < 240; i++) expect((await handleScaleRead(req(), env))?.status).toBe(200);
  const throttled = await handleScaleRead(req(), env);
  expect(throttled?.status).toBe(429);
  expect(throttled?.headers.get('retry-after')).toBe('60');
  now += 60000;
  expect((await handleScaleRead(req(), env))?.status).toBe(200);
});
