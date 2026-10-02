import { handleCommandGateway } from '../../infra/doji-orchestrator/src/command-gateway';
import { AUTHENTICATED_COMMAND_NAMES } from '../../contracts/authenticatedCommands';

const originalFetch = global.fetch;
const upstream = jest.fn();
const wake = jest.fn();
const env = {
  SUPABASE_URL: 'https://database.invalid/',
  SUPABASE_ANON_KEY: 'synthetic-public-key',
  OUTBOX_RELAY_ALARM: { idFromName: jest.fn(() => 'relay'), get: jest.fn(() => ({ fetch: wake })) },
} as unknown as Parameters<typeof handleCommandGateway>[1];
const name = AUTHENTICATED_COMMAND_NAMES[0];
function request(
  body?: string,
  headers: Record<string, string> = {},
  method = 'POST',
  path = name,
) {
  return new Request(`https://gateway.invalid/commands/rpc/${path}`, {
    method,
    headers: { authorization: 'Bearer synthetic-member', ...headers },
    body,
  });
}
beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = upstream;
  upstream.mockReset().mockImplementation(async () => Response.json({ committed: true }));
  wake.mockReset().mockImplementation(async () => Response.json({ scheduled: true }));
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  global.fetch = originalFetch;
  jest.restoreAllMocks();
});

test.each(['/elsewhere', '/commands/rpc/UPPER', '/commands/rpc/a/b'])(
  'ignores paths outside the explicit command route: %s',
  async (path) => {
    expect(
      await handleCommandGateway(new Request(`https://gateway.invalid${path}`), env),
    ).toBeNull();
    expect(upstream).not.toHaveBeenCalled();
  },
);
test('preflight is no-store and does not authenticate or execute a command', async () => {
  const result = await handleCommandGateway(request(undefined, {}, 'OPTIONS'), env);
  expect(result?.status).toBe(204);
  expect(result?.headers.get('cache-control')).toBe('no-store');
  expect(result?.headers.get('access-control-allow-methods')).toBe('POST, OPTIONS');
  expect(upstream).not.toHaveBeenCalled();
});
test.each(['GET', 'DELETE', 'PUT'])('rejects %s before upstream work', async (method) => {
  expect((await handleCommandGateway(request(undefined, {}, method), env))?.status).toBe(405);
  expect(upstream).not.toHaveBeenCalled();
});
test('rejects privileged or unknown RPCs', async () => {
  expect(
    (await handleCommandGateway(request('{}', {}, 'POST', 'service_role_only' as typeof name), env))
      ?.status,
  ).toBe(404);
  expect(upstream).not.toHaveBeenCalled();
});
test.each(['', 'Basic secret', 'bearer token'])(
  'requires the member bearer header (%s)',
  async (authorization) => {
    expect((await handleCommandGateway(request('{}', { authorization }), env))?.status).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  },
);
test.each(['SUPABASE_URL', 'SUPABASE_ANON_KEY'])('fails closed without %s', async (key) => {
  expect((await handleCommandGateway(request('{}'), { ...env, [key]: '' }))?.status).toBe(503);
  expect(upstream).not.toHaveBeenCalled();
});
test.each(['null', '[]', '1', 'true', '"text"', '{'])(
  'rejects non-object or invalid JSON: %s',
  async (body) => {
    expect((await handleCommandGateway(request(body), env))?.status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  },
);
test.each([true, false])('enforces the size cap using %s declared length', async (declared) => {
  const req = declared
    ? request('{}', { 'content-length': '131073' })
    : request('x'.repeat(131073));
  expect((await handleCommandGateway(req, env))?.status).toBe(413);
  expect(upstream).not.toHaveBeenCalled();
});
test('returns a safe error when the body stream fails', async () => {
  const req = request('{}');
  Object.defineProperty(req, 'body', {
    value: new ReadableStream({
      start(controller) {
        controller.error('synthetic broken stream');
      },
    }),
  });
  const result = await handleCommandGateway(req, env);
  expect(result?.status).toBe(400);
  expect(await result?.json()).toMatchObject({ message: 'Command payload could not be read' });
  expect(upstream).not.toHaveBeenCalled();
});
test.each([undefined, '', '{"target":"synthetic"}'])(
  'forwards the exact atomic body and member authorization: %s',
  async (body) => {
    const result = await handleCommandGateway(request(body), env);
    expect(result?.status).toBe(200);
    expect(await result?.json()).toEqual({ committed: true });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream).toHaveBeenCalledWith(
      `https://database.invalid/rest/v1/rpc/${name}`,
      expect.objectContaining({
        method: 'POST',
        body: body || '{}',
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          authorization: 'Bearer synthetic-member',
          apikey: 'synthetic-public-key',
          'x-client-info': 'doji-command-gateway/1.0',
        }),
      }),
    );
    expect(wake).toHaveBeenCalledTimes(1);
    expect(result?.headers.get('server-timing')).toContain('relay_wake;dur=');
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('"wakeOutcome":"accepted"'));
  },
);
test.each([401, 403, 409, 429, 500])(
  'preserves upstream %i and never wakes after rejection',
  async (status) => {
    upstream.mockResolvedValue(
      new Response('rejected', { status, headers: { 'content-type': 'text/plain' } }),
    );
    const result = await handleCommandGateway(request('{}'), env);
    expect(result?.status).toBe(status);
    expect(await result?.text()).toBe('rejected');
    expect(result?.headers.get('content-type')).toBe('text/plain');
    expect(wake).not.toHaveBeenCalled();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"outcome":"rejected"'));
  },
);
test.each([new Error('network failed'), 'non-error rejection'])(
  'returns bounded transport failure without leaking upstream details',
  async (error) => {
    upstream.mockRejectedValue(error);
    const result = await handleCommandGateway(request('{}'), env);
    expect(result?.status).toBe(504);
    expect(await result?.json()).toMatchObject({
      message: 'Doji could not finish that request in time',
    });
    expect(wake).not.toHaveBeenCalled();
  },
);
test.each([503, new Error('wake offline'), 'wake rejected'])(
  'a failed wake does not turn a committed command into a retryable failure: %s',
  async (failure) => {
    if (typeof failure === 'number') wake.mockResolvedValue(new Response('', { status: failure }));
    else wake.mockRejectedValue(failure);
    const result = await handleCommandGateway(request('{}'), env);
    expect(result?.status).toBe(200);
    expect(await result?.json()).toEqual({ committed: true });
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining('"wakeOutcome":"recovery_only"'),
    );
  },
);
test('accepts bounded release metadata and rejects malformed values in telemetry', async () => {
  await handleCommandGateway(
    request('{}', {
      'x-client-info': 'synthetic-client',
      'x-doji-app-version': '1.0.8',
      'x-doji-native-build': '23',
      'x-doji-platform': 'android',
      'x-doji-release-channel': 'bad value',
    }),
    env,
  );
  expect(upstream.mock.calls[0][1].headers['x-client-info']).toBe('synthetic-client');
  const metric = JSON.parse(jest.mocked(console.info).mock.calls[0][0]);
  expect(metric).toMatchObject({
    appVersion: '1.0.8',
    nativeBuildNumber: '23',
    platform: 'android',
  });
  expect(metric).not.toHaveProperty('releaseChannel');
});
test('warns on slow successful commands and supplies default content type', async () => {
  jest.spyOn(performance, 'now').mockReturnValueOnce(0).mockReturnValue(2000);
  const response = new Response('{}');
  response.headers.delete('content-type');
  upstream.mockResolvedValue(response);
  const result = await handleCommandGateway(request('{}'), env);
  expect(result?.headers.get('content-type')).toBe('application/json');
  expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('"outcome":"committed"'));
});
