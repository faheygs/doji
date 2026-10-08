jest.mock('pg', () => ({ __esModule: true, default: { Client: mockPgClient } }), { virtual: true });
jest.mock('../../infra/portal-identity-candidate/business-runtime.mts', () => ({
  createBusinessRuntime: (...args: unknown[]) => mockRuntime(...args),
}));
const mockRuntime = jest.fn();
const mockPgClient = jest.fn();
const original = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
let handler: (request: Request) => Promise<Response>;
let values: Record<string, string | undefined>;
const config = {
  realm: 'business',
  clientId: 'client_01M3T51363MDZZK6X8DB7NS32N',
  apiKey: 'synthetic',
};
beforeEach(() => {
  values = {
    BUSINESS_V2_ENABLED: 'true',
    BUSINESS_V2_CONFIG: JSON.stringify(config),
    SUPABASE_URL: 'https://tvixsmqxotuvyjqzmjla.supabase.co',
  };
  mockRuntime.mockReset().mockReturnValue(async () => new Response(null, { status: 401 }));
  mockPgClient.mockReset();
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: {
      env: { get: (key: string) => values[key] },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
  });
  jest.isolateModules(() => require('../../supabase/functions/business-portal-v2/index'));
});
afterAll(() => {
  if (original) Object.defineProperty(globalThis, 'Deno', original);
  else Reflect.deleteProperty(globalThis, 'Deno');
});
const request = () =>
  handler(
    new Request(
      'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/business-portal-v2/api/session',
    ),
  );
test('disabled endpoint never initializes a runtime or database client', async () => {
  values.BUSINESS_V2_ENABLED = 'false';
  const r = await request();
  expect(r.status).toBe(503);
  expect(r.headers.get('cache-control')).toBe('no-store');
  expect(mockRuntime).not.toHaveBeenCalled();
});
test.each([
  undefined,
  '{',
  'null',
  JSON.stringify({ ...config, realm: 'employee' }),
  JSON.stringify({ ...config, clientId: 'client_wrong' }),
])('invalid configuration fails closed without initialization: %s', async (value) => {
  values.BUSINESS_V2_CONFIG = value;
  const r = await request();
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain('synthetic');
  expect(mockRuntime).not.toHaveBeenCalled();
});
test('wrong database project cannot receive credentials', async () => {
  values.SUPABASE_URL = 'https://wrong.invalid';
  expect((await request()).status).toBe(503);
  expect(mockRuntime).not.toHaveBeenCalled();
});
test('business runtime is reused and its factory receives only the exact business boundary', async () => {
  expect((await request()).status).toBe(401);
  expect((await request()).status).toBe(401);
  expect(mockRuntime).toHaveBeenCalledTimes(1);
  expect(mockRuntime.mock.calls[0][0]).toMatchObject({
    enabled: true,
    realm: 'business',
    origin: 'https://business.dojipro.com',
    endpoint: 'https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/business-portal-v2',
  });
  mockRuntime.mock.calls[0][1].createClient({ host: 'synthetic.invalid' });
  expect(mockPgClient).toHaveBeenCalledWith({ host: 'synthetic.invalid' });
});
test('runtime failure returns generic non-cacheable feedback', async () => {
  mockRuntime.mockReturnValue(async () => {
    throw Error('sensitive-do-not-print');
  });
  const r = await request();
  expect(r.status).toBe(503);
  expect(await r.text()).not.toContain('sensitive-do-not-print');
  expect(r.headers.get('cache-control')).toBe('no-store');
});
