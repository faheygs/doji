import { rpcQueryError } from '../../lib/rpcQueryError';
import { apiFailureDetails } from '../../lib/apiFailureTelemetry';
import { shouldRetryQuery } from '../../lib/apiRetry';

jest.mock('@sentry/react-native', () => ({ init: jest.fn() }));

test('preserves HTTP status and SQLSTATE without copying SQL details or hints', () => {
  const error = rpcQueryError({ code: '57014', message: 'statement timeout', details: 'private', hint: 'private' }, { status: 500 });
  expect(apiFailureDetails(error)).toEqual({ kind: 'timeout', status: 500, code: '57014' });
  expect(error).not.toHaveProperty('details');
  expect(error).not.toHaveProperty('hint');
});

test('a wrapped SDK abort from a known deadline is reportable and retries at most once', () => {
  const error = rpcQueryError({ message: 'AbortError: Aborted', code: '' }, { status: 0, abortSource: 'deadline', timeoutMs: 6000 });
  expect(error.name).toBe('TimeoutError');
  expect(apiFailureDetails(error).kind).toBe('timeout');
  expect(shouldRetryQuery(0, error)).toBe(true);
  expect(shouldRetryQuery(1, error)).toBe(false);
});

test('parent cancellation does not inherit a private reason or transient timeout message', () => {
  const error = rpcQueryError({ message: 'private timed out', code: '57014' }, { status: 0, abortSource: 'parent' });
  expect(error.message).toBe('Request cancelled');
  expect(apiFailureDetails(error).kind).toBe('cancelled');
  expect(shouldRetryQuery(0, error)).toBe(false);
});

test.each([401, 403, 503])('an actual HTTP %s remains visible even when the parent also aborts', status => {
  const error = rpcQueryError({ message: 'failure' }, { status, abortSource: 'parent' });
  expect(apiFailureDetails(error).status).toBe(status);
  expect(apiFailureDetails(error).kind).not.toBe('cancelled');
});

test('unknown aborts are not silently treated as benign lifecycle cancellation', () => {
  const error = rpcQueryError({ name: 'AbortError', message: 'Aborted' }, { status: 0, abortSource: null });
  expect(apiFailureDetails(error).kind).toBe('unexpected');
});

test('a thrown transport failure retains its classification and bounded retry', () => {
  const error = rpcQueryError(new TypeError('Network request failed'), { abortSource: null });
  expect(error.name).toBe('TypeError');
  expect(apiFailureDetails(error).kind).toBe('network');
  expect(shouldRetryQuery(0, error)).toBe(true);
  expect(shouldRetryQuery(1, error)).toBe(false);
});
