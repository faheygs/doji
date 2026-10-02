jest.mock('npm:@noble/hashes@1.8.0/sha256', () => jest.requireActual('@noble/hashes/sha256'), {
  virtual: true,
});
jest.mock(
  'npm:ably@2.26.0',
  () => ({
    Rest: jest.fn().mockImplementation(() => ({ auth: { createTokenRequest: mockSign } })),
  }),
  { virtual: true },
);
const mockSign = jest.fn();
const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'Deno');
const originalFetch = global.fetch;
const transport = jest.fn();
let settings: Record<string, string | undefined>;
let handler: (req: Request) => Promise<Response>;
beforeEach(() => {
  settings = {};
  Object.defineProperty(globalThis, 'Deno', {
    configurable: true,
    value: {
      env: { get: (key: string) => settings[key] },
      serve: (callback: typeof handler) => {
        handler = callback;
      },
    },
  });
  transport.mockReset().mockRejectedValue(new Error('Unexpected external call'));
  global.fetch = transport;
  mockSign.mockReset().mockResolvedValue({ nonce: 'synthetic' });
});
afterEach(() => {
  global.fetch = originalFetch;
});
afterAll(() => {
  if (descriptor) Object.defineProperty(globalThis, 'Deno', descriptor);
  else Reflect.deleteProperty(globalThis, 'Deno');
});
const load = (name: string) =>
  jest.isolateModules(() => require(`../../supabase/functions/${name}/index`));
test.each([
  ['business-auth', 'BUSINESS_AUTH_ENABLED', 'BUSINESS_PORTAL_ORIGIN'],
  ['business-realtime-token', 'BUSINESS_REALTIME_ENABLED', 'BUSINESS_PORTAL_ORIGIN'],
  ['employee-register', 'EMPLOYEE_REGISTRATION_ENABLED', 'EMPLOYEE_PORTAL_ORIGIN'],
  ['employee-signin', 'EMPLOYEE_SIGNIN_ENABLED', 'EMPLOYEE_PORTAL_ORIGIN'],
  ['safety-removal', 'SAFETY_REMOVAL_ENABLED', 'SAFETY_REMOVAL_ORIGIN'],
])(
  '%s entrypoint is gated and projects environment into the real handler',
  async (name, flag, originKey) => {
    load(name);
    const disabled = await handler(new Request('https://synthetic.invalid'));
    expect([404, 503]).toContain(disabled.status);
    expect(transport).not.toHaveBeenCalled();
    Object.assign(settings, {
      [flag]: 'true',
      [originKey]: 'https://portal.invalid',
      SUPABASE_URL: 'https://database.invalid',
      SUPABASE_ANON_KEY: 'synthetic-anon',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service',
      SAFETY_TURNSTILE_SECRET: 'synthetic',
      BUSINESS_RESEND_API_KEY: 'synthetic-mail',
      BUSINESS_EMAIL_FROM: 'synthetic@example.invalid',
      BUSINESS_AUTH_PUBLIC_ADMISSION: 'true',
    });
    const options = await handler(
      new Request('https://synthetic.invalid', {
        method: 'OPTIONS',
        headers: { origin: 'https://portal.invalid' },
      }),
    );
    expect(options.status).toBe(204);
    expect(options.headers.get('access-control-allow-origin')).toBe('https://portal.invalid');
    expect(transport).not.toHaveBeenCalled();
  },
);
test.each([
  ['moderation-media', 'MODERATION_MEDIA_ENABLED', 'MODERATION_MEDIA_DISPATCH_SECRET'],
  ['safety-removal-alerts', 'SAFETY_REMOVAL_ALERTS_ENABLED', 'SAFETY_REMOVAL_DISPATCH_SECRET'],
])(
  '%s internal dispatcher remains gated and validates configured secrets',
  async (name, flag, secret) => {
    load(name);
    expect((await handler(new Request('https://synthetic.invalid'))).status).toBe(503);
    Object.assign(settings, {
      [flag]: 'true',
      [secret]: 'synthetic',
      SUPABASE_URL: 'https://database.invalid',
      SUPABASE_SERVICE_ROLE_KEY: 'synthetic',
      SAFETY_CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
      SAFETY_CLOUDFLARE_EMAIL_TOKEN: 'synthetic',
    });
    expect(
      (
        await handler(
          new Request('https://synthetic.invalid', {
            headers: { authorization: 'Bearer synthetic' },
          }),
        )
      ).status,
    ).toBe(405);
    expect(transport).not.toHaveBeenCalled();
  },
);
test.each([true, false])(
  'business realtime signing requires configured provider key=%s',
  async (configured) => {
    settings = {
      BUSINESS_REALTIME_ENABLED: 'true',
      BUSINESS_PORTAL_ORIGIN: 'https://portal.invalid',
      SUPABASE_URL: 'https://database.invalid',
      SUPABASE_ANON_KEY: 'synthetic',
      ABLY_API_KEY: configured ? 'synthetic:key' : '',
    };
    const user = '11111111-1111-4111-8111-111111111111';
    transport.mockResolvedValue(
      Response.json({ allowed: true, userId: user, topic: `business:${user}:events` }),
    );
    load('business-realtime-token');
    const response = await handler(
      new Request('https://synthetic.invalid', {
        method: 'POST',
        headers: {
          origin: 'https://portal.invalid',
          authorization: 'Bearer synthetic',
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    );
    expect(response.status).toBe(configured ? 200 : 503);
    expect(mockSign).toHaveBeenCalledTimes(configured ? 1 : 0);
    if (configured)
      expect(mockSign).toHaveBeenCalledWith({
        clientId: `business:${user}`,
        ttl: 600000,
        capability: JSON.stringify({ [`business:${user}:events`]: ['subscribe'] }),
      });
  },
);
