import { Platform } from 'react-native';
import { AbortController as NativeAbortController } from 'abort-controller';
import { executeCommand } from '../../lib/commandGateway';
import { reportApiFailure } from '../../lib/apiFailureTelemetry';

jest.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: jest
        .fn()
        .mockResolvedValue({ data: { session: { access_token: 'synthetic' } }, error: null }),
      refreshSession: jest.fn(),
    },
  },
}));
jest.mock('../../lib/apiFailureTelemetry', () => ({
  ...jest.requireActual('../../lib/apiFailureTelemetry'),
  reportApiFailure: jest.fn(),
}));
jest.mock('../../lib/releaseIdentity', () => ({
  mobileReleaseIdentity: () => ({ platform: 'test', releaseChannel: 'test' }),
}));

const originalFetch = global.fetch,
  originalController = global.AbortController;
const originalOS = Platform.OS,
  originalUrl = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
const ok = { ok: true, status: 200, text: async () => 'true' };
// Runtime retry guards must also protect an older/malformed caller without a key.
const unkeyedArgs = { p_post_id: 'synthetic-post', p_emoji: 'like' } as never;
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  global.AbortController = NativeAbortController as unknown as typeof AbortController;
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://commands.invalid';
});
afterEach(() => {
  global.fetch = originalFetch;
  global.AbortController = originalController;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS });
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = originalUrl;
  jest.useRealTimers();
});

test.each([
  ['ios', 'fetch'],
  ['ios', 'body'],
  ['android', 'fetch'],
  ['android', 'body'],
])('%s settles an unkeyed command when %s ignores native abort', async (os, phase) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  const remote = deferred<unknown>();
  global.fetch = jest
    .fn()
    .mockImplementation(() =>
      phase === 'fetch' ? remote.promise : Promise.resolve({ ...ok, text: () => remote.promise }),
    );
  let outcome: unknown;
  const work = executeCommand('toggle_post_reaction', unkeyedArgs).then((value) => {
    outcome = value;
  });
  await jest.advanceTimersByTimeAsync(12_000);
  expect(outcome).toMatchObject({ data: null, error: { message: 'Command timed out' } });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
  remote.reject(new Error('late native rejection'));
  await jest.advanceTimersByTimeAsync(120_000);
  await work;
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(reportApiFailure).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('retains a received HTTP denial when its response body stalls', async () => {
  const body = deferred<string>();
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403, text: () => body.promise });
  let outcome: unknown;
  const work = executeCommand('toggle_post_reaction', unkeyedArgs).then((value) => {
    outcome = value;
  });
  await jest.advanceTimersByTimeAsync(12_000);
  expect(outcome).toMatchObject({ data: null, error: { status: 403 } });
  body.resolve('late forbidden body');
  await work;
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test.each(['fetch', 'body'])('suspended %s cannot succeed after the gateway deadline before timers resume', async phase => {
  const held = deferred<unknown>();
  const readBody = jest.fn(() => phase === 'body' ? held.promise : Promise.resolve('true'));
  global.fetch = jest.fn(() => phase === 'fetch' ? held.promise : Promise.resolve({ ...ok, text: readBody })) as never;
  const work = executeCommand('toggle_post_reaction', unkeyedArgs);
  await jest.advanceTimersByTimeAsync(0);
  jest.setSystemTime(Date.now() + 12_001);
  held.resolve(phase === 'fetch' ? { ...ok, text: readBody } : 'true');
  expect(await work).toMatchObject({ data: null, error: { message: 'Command timed out' } });
  if (phase === 'fetch') expect(readBody).not.toHaveBeenCalled();
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('a keyed stalled body keeps exactly the existing retry and identical payload', async () => {
  const body = deferred<string>();
  global.fetch = jest.fn().mockResolvedValue({ ...ok, text: () => body.promise });
  let outcome: unknown;
  const work = executeCommand('set_post_reaction', {
    p_post_id: 'synthetic-post',
    p_emoji: 'like',
    p_active: true,
    p_idempotency_key: 'synthetic-intent',
  }).then((value) => {
    outcome = value;
  });
  await jest.advanceTimersByTimeAsync(24_250);
  expect(outcome).toMatchObject({ data: null, error: { message: 'Command timed out' } });
  const calls = (global.fetch as jest.Mock).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0][1].body).toBe(calls[1][1].body);
  body.resolve('true');
  await jest.advanceTimersByTimeAsync(120_000);
  await work;
  expect(global.fetch).toHaveBeenCalledTimes(2);
  expect(reportApiFailure).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
