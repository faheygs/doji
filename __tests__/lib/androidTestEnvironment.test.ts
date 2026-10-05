const mockNative = jest.fn();
let mockOS = 'android';
jest.mock('expo', () => ({ requireOptionalNativeModule: (...args: unknown[]) => mockNative(...args) }));
jest.mock('react-native', () => Object.create(jest.requireActual('react-native'), {
  Platform: { value: { ...jest.requireActual('react-native').Platform, get OS() { return mockOS; } } },
}));
jest.mock('@sentry/react-native', () => ({ init: jest.fn(), addBreadcrumb: jest.fn(),
  captureException: jest.fn(), withScope: jest.fn() }));

beforeEach(() => { jest.resetModules(); mockNative.mockReset(); mockOS = 'android'; });

test.each([
  ['detected', 'detected'], ['not_detected', 'not_detected'], ['unknown', 'unknown'],
  [undefined, 'unknown'], ['private unexpected native value', 'unknown'], [true, 'unknown'],
])('only bounded native status %p becomes %s', (value, expected) => {
  mockNative.mockReturnValue({ firebaseTestLab: value });
  const { androidTestLabStatus } = require('../../lib/androidTestEnvironment');
  expect(androidTestLabStatus()).toBe(expected);
  expect(androidTestLabStatus()).toBe(expected);
  expect(mockNative).toHaveBeenCalledTimes(1);
  expect(mockNative).toHaveBeenCalledWith('DojiTestEnvironment');
});

test.each([null, undefined])('older binaries with absent module %p report unknown', value => {
  mockNative.mockReturnValue(value);
  expect(require('../../lib/androidTestEnvironment').androidTestLabStatus()).toBe('unknown');
});

test('native failure cannot break reporting and is cached', () => {
  mockNative.mockImplementation(() => { throw new Error('private native error'); });
  const { androidTestLabStatus } = require('../../lib/androidTestEnvironment');
  expect(androidTestLabStatus()).toBe('unknown');
  expect(androidTestLabStatus()).toBe('unknown');
  expect(mockNative).toHaveBeenCalledTimes(1);
});

test.each(['ios', 'web'])('%s never reads Android native state or adds tags', os => {
  mockOS = os;
  const event = { message: 'unchanged' };
  expect(require('../../lib/apiFailureTelemetry').sanitizeApiFailureEvent(event)).toBe(event);
  expect(event).toEqual({ message: 'unchanged' });
  expect(mockNative).not.toHaveBeenCalled();
});

test.each(['detected', 'not_detected', 'unknown'])('%s remains an incident and survives the API privacy boundary', status => {
  mockNative.mockReturnValue({ firebaseTestLab: status });
  const event = { tags: { area: 'api', operation: 'query.shop', firebase_test_lab: 'untrusted' },
    fingerprint: ['api', 'query', 'shop', 'timeout', '504'],
    contexts: { api: { status: 504 }, device: { id: 'private' } },
    user: { email: 'private' }, request: { url: 'private' }, extra: { private: true }, breadcrumbs: [] };
  const output = require('../../lib/apiFailureTelemetry').sanitizeApiFailureEvent(event);
  expect(output).toBe(event);
  expect(output.tags).toEqual({ area: 'api', operation: 'query.shop', firebase_test_lab: status });
  expect(output.contexts).toEqual({ api: { status: 504 } });
  expect(output.fingerprint).toEqual(['api', 'query', 'shop', 'timeout', '504']);
  expect(JSON.stringify(output)).not.toContain('private');
});

test('non-API JS errors also get attribution without losing existing fields', () => {
  mockNative.mockReturnValue({ firebaseTestLab: 'detected' });
  const event = { message: 'app error', tags: { other: 'retained' }, contexts: { app: { app_version: '1.0.8' } } };
  const output = require('../../lib/apiFailureTelemetry').sanitizeApiFailureEvent(event);
  expect(output).toEqual({ ...event, tags: { other: 'retained', firebase_test_lab: 'detected' } });
});
