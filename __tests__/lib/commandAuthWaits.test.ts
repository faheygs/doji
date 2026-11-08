import { Platform } from 'react-native';
import { AbortController as NativeAbortController } from 'abort-controller';
import { executeCommand } from '../../lib/commandGateway';
import { supabase } from '../../lib/supabase';
import { awaitCommandAuthentication } from '../../lib/commandAuthentication';
import {
  abortRegistration,
  PushRegistrationInterrupted,
} from '../../lib/pushRegistrationCancellation';
jest.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: jest.fn(), refreshSession: jest.fn() } },
}));
jest.mock('../../lib/apiFailureTelemetry', () => ({
  ...jest.requireActual('../../lib/apiFailureTelemetry'),
  reportApiFailure: jest.fn(),
}));
jest.mock('../../lib/releaseIdentity', () => ({
  mobileReleaseIdentity: () => ({ platform: 'ios', releaseChannel: 'test' }),
}));
const originalFetch = global.fetch,
  originalAbort = global.AbortController,
  originalOS = Platform.OS;
const originalUrl = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
const session = {
  data: { session: { access_token: 'synthetic-token', user: { id: 'member' } } },
  error: null,
};
const args = { p_notification_key: 'synthetic-key', p_dismissed_at: 'now' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.useFakeTimers();
  global.AbortController = NativeAbortController as unknown as typeof AbortController;
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://commands.invalid';
  jest
    .mocked(supabase.auth.getSession)
    .mockReset()
    .mockResolvedValue(session as never);
  jest
    .mocked(supabase.auth.refreshSession)
    .mockReset()
    .mockResolvedValue(session as never);
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'true' });
});
afterEach(() => {
  global.fetch = originalFetch;
  global.AbortController = originalAbort;
  Platform.OS = originalOS;
  jest.useRealTimers();
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = originalUrl;
});

test.each(['ios', 'android'] as const)(
  '%s session lookup is bounded and cannot dispatch with late credentials',
  async (platform) => {
    Platform.OS = platform;
    const held = deferred<typeof session>();
    jest.mocked(supabase.auth.getSession).mockReturnValue(held.promise as never);
    const result = jest.fn();
    void executeCommand('dismiss_notification', args).then(result);
    await jest.advanceTimersByTimeAsync(8_000);
    expect(result).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({ code: 'DOJI_COMMAND_AUTH_TIMEOUT' }),
      }),
    );
    expect(global.fetch).not.toHaveBeenCalled();
    held.resolve(session);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('a stalled 401 refresh is bounded without replaying the command when auth settles late', async () => {
  const held = deferred<typeof session>();
  jest.mocked(supabase.auth.refreshSession).mockReturnValue(held.promise as never);
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' });
  const result = jest.fn();
  void executeCommand('dismiss_notification', args).then(result);
  await jest.advanceTimersByTimeAsync(8_000);
  expect(result).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({ code: 'DOJI_COMMAND_AUTH_TIMEOUT' }),
    }),
  );
  held.resolve(session);
  await jest.advanceTimersByTimeAsync(60_000);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('an auth refresh exception is not a reason to replay even a retryable command', async () => {
  jest.mocked(supabase.auth.refreshSession).mockRejectedValue(Error('synthetic auth unavailable'));
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' });
  const work = executeCommand('dismiss_notification', args);
  await jest.advanceTimersByTimeAsync(30_000);
  expect((await work).error?.message).toBe('synthetic auth unavailable');
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('initial auth rejection returns a command result instead of an unhandled UI promise', async () => {
  jest.mocked(supabase.auth.getSession).mockRejectedValue(Error('synthetic auth unavailable'));
  const result = jest.fn(),
    rejected = jest.fn();
  void executeCommand('dismiss_notification', args).then(result, rejected);
  await jest.advanceTimersByTimeAsync(0);
  expect(rejected).not.toHaveBeenCalled();
  expect(result).toHaveBeenCalledWith(
    expect.objectContaining({
      error: expect.objectContaining({ message: 'synthetic auth unavailable' }),
    }),
  );
  expect(global.fetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('already-cancelled auth observation consumes late rejection and clears its own timer', async () => {
  const controller = new AbortController();
  abortRegistration(controller, new PushRegistrationInterrupted('account'));
  await expect(
    awaitCommandAuthentication(Promise.reject(Error('late synthetic failure')), controller.signal),
  ).rejects.toMatchObject({ code: 'DOJI_PUSH_INTERRUPTED' });
  expect(jest.getTimerCount()).toBe(0);
});

test('returning from suspension cannot accept credentials past the deadline before timers run', async () => {
  const held = deferred<typeof session>();
  const work = awaitCommandAuthentication(held.promise);
  const outcome = expect(work).rejects.toMatchObject({ code: 'DOJI_COMMAND_AUTH_TIMEOUT' });
  jest.setSystemTime(Date.now() + 8_001);
  held.resolve(session);
  await outcome;
  expect(jest.getTimerCount()).toBe(0);
});
