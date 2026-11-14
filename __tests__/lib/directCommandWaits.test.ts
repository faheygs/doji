import { AbortController as NativeAbortController } from 'abort-controller';
import { Platform } from 'react-native';
import { executeCommand } from '../../lib/commandGateway';
import { supabase } from '../../lib/supabase';
import { directCommand } from '../../lib/directCommand';
import {
  abortRegistration,
  PushRegistrationInterrupted,
} from '../../lib/pushRegistrationCancellation';

jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn(), auth: { getSession: jest.fn() } },
}));
jest.mock('../../lib/apiFailureTelemetry', () => ({ reportApiFailure: jest.fn() }));
const originalUrl = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
const originalAbort = global.AbortController,
  originalOS = Platform.OS;
const args = { p_notification_key: 'synthetic', p_dismissed_at: 'now' };
const success = { data: true, error: null };
let settle: (value: typeof success) => void;
let reject: (error: unknown) => void;
let nativeSignal: AbortSignal | undefined;
let setHeader: jest.Mock;
let current: boolean;
const account = { expectedUserId: 'member', isCurrent: () => current };

beforeEach(() => {
  jest.useFakeTimers();
  global.AbortController = NativeAbortController as unknown as typeof AbortController;
  delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  current = true;
  nativeSignal = undefined;
  const work = new Promise<typeof success>((resolve, fail) => {
    settle = resolve;
    reject = fail;
  });
  const query: Promise<typeof success> & { abortSignal: jest.Mock; setHeader: jest.Mock } =
    Object.assign(work, {
      abortSignal: jest.fn((signal: AbortSignal) => {
        nativeSignal = signal;
        return query;
      }),
      setHeader: jest.fn(() => query),
    });
  setHeader = query.setHeader;
  jest
    .mocked(supabase.rpc)
    .mockReset()
    .mockReturnValue(query as never);
  jest
    .mocked(supabase.auth.getSession)
    .mockReset()
    .mockResolvedValue({
      data: { session: { access_token: 'synthetic-token', user: { id: 'member' } } },
      error: null,
    } as never);
});
afterEach(() => {
  global.AbortController = originalAbort;
  Platform.OS = originalOS;
  if (originalUrl === undefined) delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = originalUrl;
  jest.useRealTimers();
});

test.each(['ios', 'android'] as const)(
  '%s direct native wait settles even if abort is ignored',
  async (platform) => {
    Platform.OS = platform;
    const observed = jest.fn();
    void executeCommand('dismiss_notification', args).then(observed);
    await jest.advanceTimersByTimeAsync(12_000);
    expect(observed).toHaveBeenCalledWith({
      data: null,
      error: expect.objectContaining({ code: 'DOJI_COMMAND_TIMEOUT' }),
    });
    expect(nativeSignal?.aborted).toBe(true);
    settle(success);
    await jest.advanceTimersByTimeAsync(60_000);
    expect(observed).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  },
);

test('account-bound direct waits use captured authorization and the same deadline', async () => {
  const result = executeCommand('dismiss_notification', args, account);
  await jest.advanceTimersByTimeAsync(12_000);
  expect((await result).error?.code).toBe('DOJI_COMMAND_TIMEOUT');
  expect(setHeader).toHaveBeenCalledWith('Authorization', 'Bearer synthetic-token');
  expect(nativeSignal?.aborted).toBe(true);
  reject(Error('late native rejection'));
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('direct success and server denial retain their exact results without retry', async () => {
  const result = executeCommand('dismiss_notification', args);
  settle(success);
  expect(await result).toEqual(success);
  const denial = { data: null, error: { code: '42501', message: 'denied' } };
  jest
    .mocked(supabase.rpc)
    .mockReturnValue({ abortSignal: () => Promise.resolve(denial) } as never);
  expect(await executeCommand('dismiss_notification', args)).toEqual(denial);
  expect(supabase.rpc).toHaveBeenCalledTimes(2);
  expect(jest.getTimerCount()).toBe(0);
});

test('a rejected direct transport becomes a command error, not an unhandled UI rejection', async () => {
  const result = executeCommand('dismiss_notification', args);
  reject(Error('synthetic failure'));
  expect((await result).error?.message).toBe('synthetic failure');
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('returning from suspension cannot accept expired success before timer delivery', async () => {
  const result = executeCommand('dismiss_notification', args);
  jest.setSystemTime(Date.now() + 12_001);
  settle(success);
  expect((await result).error?.code).toBe('DOJI_COMMAND_TIMEOUT');
  expect(nativeSignal?.aborted).toBe(true);
  expect(jest.getTimerCount()).toBe(0);
});

test('an account switch fences direct success without claiming rollback', async () => {
  const result = executeCommand('dismiss_notification', args, account);
  await jest.advanceTimersByTimeAsync(0);
  current = false;
  settle(success);
  expect(await result).toMatchObject({ data: null, error: { status: 401 } });
  expect(supabase.rpc).toHaveBeenCalledTimes(1);
});

test('registration cancellation interrupts direct observation and consumes late completion', async () => {
  const controller = new AbortController();
  const result = executeCommand('register_native_push_endpoint', {} as never, {
    ...account,
    registrationSignal: controller.signal,
  });
  await jest.advanceTimersByTimeAsync(0);
  abortRegistration(controller, new PushRegistrationInterrupted('background'));
  expect((await result).error?.code).toBe('DOJI_PUSH_INTERRUPTED');
  expect(nativeSignal?.aborted).toBe(true);
  settle(success);
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('already cancelled direct work never dispatches', async () => {
  const controller = new AbortController();
  abortRegistration(controller, new PushRegistrationInterrupted('account'));
  expect(
    (await directCommand('dismiss_notification', args, undefined, controller.signal)).error?.code,
  ).toBe('DOJI_PUSH_INTERRUPTED');
  expect(supabase.rpc).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('synchronous query construction failure is contained and releases the deadline', async () => {
  jest.mocked(supabase.rpc).mockImplementation(() => {
    throw Error('synthetic construction');
  });
  expect((await executeCommand('dismiss_notification', args)).error?.message).toBe(
    'synthetic construction',
  );
  expect(jest.getTimerCount()).toBe(0);
});
