import { executeCommand } from '../../lib/commandGateway';
import { reportApiFailure } from '../../lib/apiFailureTelemetry';
import { supabase } from '../../lib/supabase';
import { abortRegistration, PushRegistrationInterrupted } from '../../lib/pushRegistrationCancellation';
import { AbortController as NativeAbortController } from 'abort-controller';
jest.mock('../../lib/supabase', () => ({ supabase: { auth: {
  getSession: jest.fn(), refreshSession: jest.fn(),
} } }));
jest.mock('../../lib/apiFailureTelemetry', () => ({ ...jest.requireActual('../../lib/apiFailureTelemetry'), reportApiFailure: jest.fn() }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({ platform: 'ios', releaseChannel: 'test' }) }));

const originalFetch = global.fetch;
const originalAbortController = global.AbortController;
const originalUrl = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
const args = { p_installation_id: 'local-install', p_token: 'local-token', p_platform: 'ios', p_environment: 'sandbox', p_expo_token: null };
const session = { data: { session: { access_token: 'local-test-token', user: { id: 'member' } } }, error: null };
const ok = { ok: true, status: 200, text: async () => 'true' };
let controller: AbortController;
const account = () => ({ expectedUserId: 'member', isCurrent: () => true, registrationSignal: controller.signal });
const interrupt = () => abortRegistration(controller, new PushRegistrationInterrupted('background'));
function pending<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((r, j) => { resolve = r; reject = j; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  jest.clearAllMocks(); jest.useFakeTimers();
  global.AbortController = NativeAbortController as unknown as typeof AbortController;
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://audit.invalid';
  controller = new AbortController();
  (supabase.auth.getSession as jest.Mock).mockReset().mockResolvedValue(session);
  (supabase.auth.refreshSession as jest.Mock).mockReset().mockResolvedValue(session);
});
afterEach(() => {
  global.fetch = originalFetch; global.AbortController = originalAbortController; jest.useRealTimers();
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = originalUrl;
});

test('already interrupted registration does not read credentials or dispatch', async () => {
  interrupt(); global.fetch = jest.fn();
  expect((await executeCommand('register_native_push_endpoint', args, account())).error?.code).toBe('DOJI_PUSH_INTERRUPTED');
  expect(supabase.auth.getSession).not.toHaveBeenCalled(); expect(global.fetch).not.toHaveBeenCalled();
});

test('background during session lookup settles without waiting and never dispatches late', async () => {
  const auth = pending<typeof session>(); (supabase.auth.getSession as jest.Mock).mockReturnValueOnce(auth.promise);
  global.fetch = jest.fn();
  const work = executeCommand('register_native_push_endpoint', args, account());
  interrupt(); expect((await work).error?.code).toBe('DOJI_PUSH_INTERRUPTED');
  auth.resolve(session); await jest.advanceTimersByTimeAsync(0);
  expect(global.fetch).not.toHaveBeenCalled(); expect(reportApiFailure).not.toHaveBeenCalled();
});

test.each(['fetch', 'body'])('background during %s settles even when native transport ignores abort', async phase => {
  const remote = pending<unknown>();
  global.fetch = jest.fn().mockImplementation(() => phase === 'fetch' ? remote.promise : Promise.resolve({ ...ok, text: () => remote.promise }));
  const work = executeCommand('register_native_push_endpoint', args, account());
  await jest.advanceTimersByTimeAsync(0);
  interrupt(); expect((await work).error?.code).toBe('DOJI_PUSH_INTERRUPTED');
  expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
  remote.reject(new Error('late transport rejection'));
  await jest.advanceTimersByTimeAsync(120_000);
  expect(global.fetch).toHaveBeenCalledTimes(1); expect(reportApiFailure).not.toHaveBeenCalled();
});

test('genuine HTTP 504 before background remains reportable; retry is cancelled', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 504, text: async () => 'Gateway Timeout' });
  const work = executeCommand('register_native_push_endpoint', args, account());
  await jest.advanceTimersByTimeAsync(0);
  interrupt(); expect((await work).error?.code).toBe('DOJI_PUSH_INTERRUPTED');
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(reportApiFailure).toHaveBeenCalledTimes(1);
  expect(reportApiFailure).toHaveBeenCalledWith('command', 'register_native_push_endpoint', expect.objectContaining({ status: 504 }), expect.anything());
  expect(jest.getTimerCount()).toBe(0);
});

test('received HTTP rejection survives cancellation while its body is still pending', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, text: () => new Promise(() => {}) });
  const work = executeCommand('register_native_push_endpoint', args, account());
  await jest.advanceTimersByTimeAsync(0); interrupt(); await work;
  expect(reportApiFailure).toHaveBeenCalledWith('command', 'register_native_push_endpoint', expect.objectContaining({ status: 503 }), expect.anything());
  expect(global.fetch).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test('a real foreground deadline is still reported if background follows during backoff', async () => {
  global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
  const work = executeCommand('register_native_push_endpoint', args, account());
  await jest.advanceTimersByTimeAsync(12_000); interrupt(); await work;
  expect(reportApiFailure).toHaveBeenCalledWith('command', 'register_native_push_endpoint', expect.objectContaining({ message: 'Command timed out' }), expect.anything());
  expect(global.fetch).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test('foreground genuine deadlines keep exactly the existing one gateway retry', async () => {
  global.fetch = jest.fn().mockImplementation(() => new Promise(() => {}));
  const work = executeCommand('register_native_push_endpoint', args, account());
  await jest.advanceTimersByTimeAsync(24_250);
  expect((await work).error?.message).toBe('Command timed out');
  expect(global.fetch).toHaveBeenCalledTimes(2); expect(reportApiFailure).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('interruption while refreshing auth cannot replay with late credentials', async () => {
  const auth = pending<typeof session>(); (supabase.auth.refreshSession as jest.Mock).mockReturnValueOnce(auth.promise);
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 401, text: async () => '' });
  const work = executeCommand('register_native_push_endpoint', args, account());
  await jest.advanceTimersByTimeAsync(0); interrupt(); await work;
  auth.resolve(session); await jest.advanceTimersByTimeAsync(0);
  expect(global.fetch).toHaveBeenCalledTimes(1); expect(jest.getTimerCount()).toBe(0);
});

test('unrelated commands do not opt into push lifecycle cancellation', async () => {
  const remote = pending<typeof ok>(); global.fetch = jest.fn().mockReturnValue(remote.promise);
  const work = executeCommand('dismiss_notification', { p_notification_key: 'key', p_dismissed_at: 'now' }, account());
  await jest.advanceTimersByTimeAsync(0); interrupt();
  expect((global.fetch as jest.Mock).mock.calls[0][1].signal.aborted).toBe(false);
  remote.resolve(ok); expect((await work).error).toBeNull();
  expect(reportApiFailure).not.toHaveBeenCalled(); expect(jest.getTimerCount()).toBe(0);
});
