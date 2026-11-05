jest.mock(
  'https://esm.sh/@supabase/supabase-js@2',
  () => ({ createClient: (...args: unknown[]) => mockClient(...args) }),
  { virtual: true },
);
const mockClient = jest.fn(),
  getUser = jest.fn(),
  rpc = jest.fn(),
  abortSignal = jest.fn();
const originalDeno = Object.getOwnPropertyDescriptor(globalThis, 'Deno'),
  originalFetch = global.fetch;
let handler: (request: Request) => Promise<Response>;
let settings: Record<string, string | undefined>;
const actor = '99100000-0000-4000-8000-000000000001';
const request = () =>
  new Request('https://local.invalid/mobile-workflow-report', {
    method: 'POST',
    headers: {
      authorization: 'Bearer synthetic-member-token-0001',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      id: 'wf:synthetic-batch-0001',
      issuedAt: Date.now(),
      platform: 'ios',
      rows: [{ phase: 'receipt', outcome: 'confirmed', count: 1, capped: false }],
    }),
  });
beforeEach(() => {
  settings = {
    MOBILE_WORKFLOW_REPORTING_ENABLED: 'true',
    DOJI_ENVIRONMENT: 'staging',
    SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co',
    SUPABASE_ANON_KEY: 'synthetic-public',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
  };
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: {
      env: { get: (name: string) => settings[name] },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
  });
  getUser
    .mockReset()
    .mockResolvedValue({ data: { user: { id: actor, is_anonymous: false } }, error: null });
  abortSignal.mockReset().mockResolvedValue({ data: 'accepted', error: null });
  rpc.mockReset().mockReturnValue({ abortSignal });
  mockClient.mockReset().mockReturnValue({ auth: { getUser }, rpc });
  global.fetch = jest.fn(async () => {
    throw Error('Unmocked external request');
  });
  jest.isolateModules(() => require('../../supabase/functions/mobile-workflow-report/index'));
});
afterEach(() => {
  global.fetch = originalFetch;
  if (originalDeno) Object.defineProperty(globalThis, 'Deno', originalDeno);
  else Reflect.deleteProperty(globalThis, 'Deno');
});
test('real entry validates bearer with project Auth before service-only fixed counts', async () => {
  expect((await handler(request())).status).toBe(204);
  expect(getUser).toHaveBeenCalledWith('synthetic-member-token-0001');
  expect(mockClient.mock.calls.map((call) => call[1])).toEqual([
    'synthetic-public',
    'synthetic-service',
  ]);
  expect(rpc).toHaveBeenCalledWith(
    'record_mobile_workflow_counts_v1',
    expect.objectContaining({ p_actor: actor }),
  );
  const signal = abortSignal.mock.calls[0][0];
  expect(signal.aborted).toBe(true);
  for (const call of mockClient.mock.calls) {
    const scopedFetch = call[2].global.fetch;
    await expect(scopedFetch('https://local.invalid/', { redirect: 'follow' })).rejects.toThrow(
      'Unmocked external',
    );
    expect(global.fetch).toHaveBeenLastCalledWith(
      'https://local.invalid/',
      expect.objectContaining({ signal, redirect: 'error' }),
    );
  }
});
test.each([
  { data: { user: null } },
  { data: { user: { id: actor, is_anonymous: true } } },
  { data: { user: { id: actor } }, error: 'private' },
])('unverified or anonymous principals never invoke service command', async (value) => {
  getUser.mockResolvedValue(value);
  expect((await handler(request())).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled();
});
test('disabled reports do not create clients, and database failures remain unavailable', async () => {
  settings.MOBILE_WORKFLOW_REPORTING_ENABLED = undefined;
  expect((await handler(request())).status).toBe(404);
  expect(mockClient).not.toHaveBeenCalled();
  settings.MOBILE_WORKFLOW_REPORTING_ENABLED = 'true';
  abortSignal.mockResolvedValue({ error: 'private SQL detail' });
  const response = await handler(request());
  expect(response.status).toBe(503);
  expect(await response.text()).toBe('');
});
