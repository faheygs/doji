import * as Sentry from '@sentry/react-native';
import {
  recordRealtimeFailure,
  recordOperationalFailure,
  reportRealtimeFailure,
  reportOperationalFailure,
} from '../../lib/telemetry';
const mockScope = { setTag: jest.fn(), setContext: jest.fn() };
jest.mock('@sentry/react-native', () => ({
  addBreadcrumb: jest.fn(),
  captureException: jest.fn(),
  withScope: jest.fn((callback) => callback(mockScope)),
}));
const previousDev = __DEV__;
let operation = 0;
beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-10-01T12:00:00Z'));
  Reflect.set(globalThis, '__DEV__', false);
  operation += 1;
});
afterEach(() => {
  jest.useRealTimers();
  Reflect.set(globalThis, '__DEV__', previousDev);
});

test.each([
  [
    Object.assign(Error('typed'), { code: 50001, statusCode: 500 }),
    { errorName: 'Error', errorMessage: 'typed', errorCode: 50001, statusCode: 500 },
  ],
  [
    Error('plain'),
    { errorName: 'Error', errorMessage: 'plain', errorCode: undefined, statusCode: undefined },
  ],
  [
    { message: 'object', code: 9, statusCode: 503 },
    { errorMessage: 'object', errorCode: 9, statusCode: 503 },
  ],
  [
    { message: 42, code: '9', statusCode: '503' },
    { errorMessage: 'Unknown realtime error', errorCode: undefined, statusCode: undefined },
  ],
  ['string failure', { errorMessage: 'string failure' }],
  [null, { errorMessage: 'Unknown realtime error' }],
])(
  'breadcrumbs normalize the error shape without spreading arbitrary properties (%s)',
  (error, details) => {
    recordRealtimeFailure('attach', error, { attempt: 2 });
    expect(Sentry.addBreadcrumb).toHaveBeenCalledWith({
      category: 'realtime',
      level: 'warning',
      message: 'attach',
      data: { attempt: 2, ...details },
    });
    recordOperationalFailure('startup', 'profile', error);
    expect(Sentry.addBreadcrumb).toHaveBeenLastCalledWith({
      category: 'startup',
      level: 'warning',
      message: 'profile',
      data: details,
    });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  },
);

test.each(['realtime', 'operational'])(
  '%s reports are bounded per operation/code but preserve diagnostic breadcrumbs',
  (kind) => {
    const error = Object.assign(Error('unexpected provider rejection'), { code: 90001 });
    const name = `bounded-${operation}`;
    const report = () =>
      kind === 'realtime'
        ? reportRealtimeFailure(name, error, { attempt: 3 })
        : reportOperationalFailure('startup', name, error, { attempt: 3 });
    report();
    report();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    expect(Sentry.captureException).toHaveBeenCalledWith(error);
    expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(2);
    expect(mockScope.setTag).toHaveBeenCalledWith(
      'area',
      kind === 'realtime' ? 'realtime' : 'startup',
    );
    expect(mockScope.setContext).toHaveBeenCalledWith(
      kind === 'realtime' ? 'realtime' : 'startup',
      expect.objectContaining({ attempt: 3, errorCode: 90001 }),
    );
    jest.advanceTimersByTime(59999);
    report();
    expect(Sentry.captureException).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(1);
    report();
    expect(Sentry.captureException).toHaveBeenCalledTimes(2);
  },
);

test('distinct status codes and operations do not suppress each other', () => {
  const name = `different-${operation}`;
  reportRealtimeFailure(name, { message: 'server failure', statusCode: 500 });
  reportRealtimeFailure(name, { message: 'server failure', statusCode: 501 });
  reportRealtimeFailure(`${name}-another`, 'failure');
  reportOperationalFailure('startup', name, { message: 'failure', statusCode: 500 });
  reportOperationalFailure('startup', name, { message: 'failure', statusCode: 501 });
  reportOperationalFailure('startup', `${name}-another`, 'failure');
  expect(Sentry.captureException).toHaveBeenCalledTimes(6);
  for (const [error] of jest.mocked(Sentry.captureException).mock.calls)
    expect(error).toBeInstanceOf(Error);
});

test('development failures remain breadcrumbs and do not send incidents', () => {
  Reflect.set(globalThis, '__DEV__', true);
  reportRealtimeFailure(`dev-${operation}`, Error('failure'));
  reportOperationalFailure('startup', `dev-${operation}`, Error('failure'));
  expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(2);
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('recognized radio loss stays diagnostic; unexpected failure still reports', () => {
  const name = `radio-${operation}`;
  reportRealtimeFailure(name, { code: 80003 });
  reportOperationalFailure('startup', name, Error('network unreachable'));
  expect(Sentry.captureException).not.toHaveBeenCalled();
  expect(Sentry.addBreadcrumb).toHaveBeenCalledTimes(2);
  reportRealtimeFailure(name, Error('invalid response contract'));
  reportOperationalFailure('startup', name, Error('invalid response contract'));
  expect(Sentry.captureException).toHaveBeenCalledTimes(2);
});
