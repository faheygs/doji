import { isTransientPushRegistrationError, retryPushRegistration } from '../../lib/retryPushRegistration';
import { PushRegistrationInterrupted } from '../../lib/pushRegistrationCancellation';

const tokenError = (reason: string) => new Error(`Fetching the token failed: java.util.concurrent.ExecutionException: java.io.IOException: ${reason}`);

afterEach(() => jest.useRealTimers());

test('background interruption immediately clears backoff and does not wait for a suspended timer', async () => {
  jest.useFakeTimers();
  const controller = new AbortController();
  const register = jest.fn().mockRejectedValue(tokenError('SERVICE_NOT_AVAILABLE'));
  const pending = retryPushRegistration(register, () => false, jest.fn(), controller.signal);
  await jest.advanceTimersByTimeAsync(0);
  expect(jest.getTimerCount()).toBe(1);
  controller.abort(new PushRegistrationInterrupted('background'));
  expect(await pending).toBe(false);
  expect(jest.getTimerCount()).toBe(0);
  await jest.advanceTimersByTimeAsync(120_000);
  expect(register).toHaveBeenCalledTimes(1);
});

test.each(['SERVICE_NOT_AVAILABLE', 'INTERNAL_SERVER_ERROR', 'InternalServerError'])(
  'recovers from native %s using a bounded delayed retry', async reason => {
    jest.useFakeTimers();
    const register = jest.fn().mockRejectedValueOnce(tokenError(reason)).mockResolvedValue(true);
    const onRetry = jest.fn();
    const pending = retryPushRegistration(register, () => false, onRetry);
    await jest.advanceTimersByTimeAsync(799);
    expect(register).toHaveBeenCalledTimes(1);
    await jest.runAllTimersAsync();
    await expect(pending).resolves.toBe(true);
    expect(register).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledTimes(1);
  },
);

test.each(['FIS_AUTH_ERROR', 'AUTHENTICATION_FAILED', 'INVALID_SENDER', 'SERVICE_NOT_AVAILABLE_EXTRA', 'unknown'])(
  'does not retry native permanent/unclassified failure %s', async reason => {
    const error = tokenError(reason);
    const register = jest.fn().mockRejectedValue(error);
    const onRetry = jest.fn();
    await expect(retryPushRegistration(register, () => false, onRetry)).rejects.toBe(error);
    expect(register).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  },
);

test('terminal failure is returned once after exactly four attempts', async () => {
  jest.useFakeTimers();
  const error = tokenError('SERVICE_NOT_AVAILABLE');
  const register = jest.fn().mockRejectedValue(error);
  const onRetry = jest.fn();
  const pending = retryPushRegistration(register, () => false, onRetry);
  const result = expect(pending).rejects.toBe(error);
  await jest.runAllTimersAsync();
  await result;
  expect(register).toHaveBeenCalledTimes(4);
  expect(onRetry).toHaveBeenCalledTimes(3);
  expect(jest.getTimerCount()).toBe(0);
});

test('unmount/account change during backoff prevents another registration', async () => {
  jest.useFakeTimers();
  let cancelled = false;
  const register = jest.fn().mockRejectedValue(tokenError('SERVICE_NOT_AVAILABLE'));
  const pending = retryPushRegistration(register, () => cancelled, () => { cancelled = true; });
  await jest.runAllTimersAsync();
  await expect(pending).resolves.toBe(false);
  expect(register).toHaveBeenCalledTimes(1);
});

test('obsolete in-flight failure does not retry or become a terminal incident', async () => {
  let cancelled = false;
  const register = jest.fn(async () => { cancelled = true; throw tokenError('SERVICE_NOT_AVAILABLE'); });
  await expect(retryPushRegistration(register, () => cancelled, jest.fn())).resolves.toBe(false);
  expect(register).toHaveBeenCalledTimes(1);
});

test('permission/session no longer applicable is not retried', async () => {
  const register = jest.fn().mockResolvedValue(false);
  await expect(retryPushRegistration(register, () => false, jest.fn())).resolves.toBe(false);
  expect(register).toHaveBeenCalledTimes(1);
});

test('existing network/command retries remain, authorization errors remain terminal', () => {
  expect(isTransientPushRegistrationError(new Error('Network request failed'))).toBe(true);
  expect(isTransientPushRegistrationError({ status: 503, message: 'unavailable' })).toBe(true);
  expect(isTransientPushRegistrationError({ code: '42501', message: 'permission denied' })).toBe(false);
  expect(isTransientPushRegistrationError(null)).toBe(false);
});
