const mockInfo = jest.fn();
const mockCurrent = jest.fn();
const mockSnapshot = jest.fn();
const mockScopeData = jest.fn();
jest.mock('@sentry/react-native', () => ({
  logger: { info: (...args: unknown[]) => mockInfo(...args) },
  getCurrentScope: () => ({ getScopeData: () => mockScopeData() }),
  getIsolationScope: () => ({ getScopeData: () => mockScopeData() }),
  getGlobalScope: () => ({ getScopeData: () => mockScopeData() }),
}));
jest.mock('../../lib/mobileDiagnosticContext', () => ({
  diagnosticSessionIsCurrent: (id: unknown) => mockCurrent(id),
  mobileDiagnosticSnapshot: () => mockSnapshot(),
}));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({
  platform: 'ios', appVersion: '1.0.9', nativeBuildNumber: '104',
}) }));

const EVENT = '997e12597a43431dada72dab52b4ba91';
const SESSION = 'diag:local-session-123456';
const INSTALLATION = 'diag:local-installation-123456';
const COMMAND = 'register_native_push_endpoint_v3';
const HOUR = 3_600_000;
let recovery: typeof import('../../lib/pushRegistrationRecovery');
const originalDev = __DEV__;
beforeEach(() => {
  jest.resetModules(); jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-08T18:00:00Z'));
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
  mockInfo.mockReset(); mockCurrent.mockReset().mockImplementation(id => id === SESSION);
  mockSnapshot.mockReset().mockReturnValue({ installation_id: INSTALLATION });
  mockScopeData.mockReset().mockReturnValue({ attributes: {} });
  recovery = require('../../lib/pushRegistrationRecovery');
});
afterEach(() => { jest.useRealTimers(); (globalThis as unknown as { __DEV__: boolean }).__DEV__ = originalDev; });
function note() { recovery.notePushRegistrationIncident(COMMAND, EVENT, SESSION); }
function recover() { note(); recovery.reportPushRegistrationRecovery(); }

test.each(['register_native_push_endpoint', 'register_native_push_endpoint_v2', COMMAND])('correlates %s once after explicit confirmation', command => {
  recovery.notePushRegistrationIncident(command, EVENT, SESSION);
  expect(recovery.hasPendingPushRegistrationIncident()).toBe(true);
  jest.advanceTimersByTime(4500);
  recovery.reportPushRegistrationRecovery(); recovery.reportPushRegistrationRecovery();
  expect(mockInfo).toHaveBeenCalledTimes(1);
  expect(mockInfo).toHaveBeenCalledWith('Doji push registration recovered', {
    operation: 'push_registration', outcome: 'recovered', acknowledgement: 'server_confirmed',
    failure_event_id: EVENT, diagnostic_session: SESSION, diagnostic_installation: INSTALLATION,
    recovery_elapsed_ms: 4500, platform: 'ios', app_version: '1.0.9', native_build: '104',
  });
  expect(recovery.hasPendingPushRegistrationIncident()).toBe(false);
});
test.each([
  ['delete_account', EVENT, SESSION], [COMMAND, undefined, SESSION], [COMMAND, 'invalid', SESSION],
  [COMMAND, EVENT, 'someone@example.com'], [COMMAND, EVENT, 'diag:another-session-12345'],
])('rejects unrelated or invalid correlation %#', (command, event, session) => {
  recovery.notePushRegistrationIncident(command as string, event, session);
  recovery.reportPushRegistrationRecovery();
  expect(mockInfo).not.toHaveBeenCalled();
});
test('retains the first event and elapsed time for a single recovery episode', () => {
  note(); jest.advanceTimersByTime(1000);
  recovery.notePushRegistrationIncident(COMMAND, 'a'.repeat(32), SESSION);
  recovery.reportPushRegistrationRecovery();
  expect(mockInfo.mock.calls[0][1]).toMatchObject({ failure_event_id: EVENT, recovery_elapsed_ms: 1000 });
});
test('drops stale and previous-account incidents', () => {
  note(); mockCurrent.mockReturnValue(false); recovery.reportPushRegistrationRecovery();
  expect(mockInfo).not.toHaveBeenCalled();
  mockCurrent.mockReturnValue(true); note(); jest.advanceTimersByTime(24 * HOUR);
  expect(recovery.hasPendingPushRegistrationIncident()).toBe(false);
  recovery.reportPushRegistrationRecovery(); expect(mockInfo).not.toHaveBeenCalled();
});
test('caps three records in a rolling hour, including across clock rollback', () => {
  recover(); jest.advanceTimersByTime(30 * 60_000); recover(); recover(); recover();
  expect(mockInfo).toHaveBeenCalledTimes(3);
  jest.setSystemTime(Date.now() - HOUR); recover(); expect(mockInfo).toHaveBeenCalledTimes(3);
  jest.setSystemTime(Date.now() + HOUR + 30 * 60_000); recover();
  expect(mockInfo).toHaveBeenCalledTimes(4);
  recover(); expect(mockInfo).toHaveBeenCalledTimes(4);
});
test('routine success and development generate no recovery logs', () => {
  recovery.reportPushRegistrationRecovery(); expect(mockInfo).not.toHaveBeenCalled();
  (globalThis as unknown as { __DEV__: boolean }).__DEV__ = true;
  recover(); expect(mockInfo).not.toHaveBeenCalled();
});
test('logger failure cannot break confirmed registration or loop', () => {
  mockInfo.mockImplementation(() => { throw new Error('logger unavailable'); });
  expect(recover).not.toThrow();
  expect(recovery.hasPendingPushRegistrationIncident()).toBe(false);
});
test('sanitizer removes all ambient user data and rejects unrelated logs', () => {
  recover();
  const attributes = { ...mockInfo.mock.calls[0][1], 'user.email': 'private@example.com',
    token: 'secret', url: 'https://private.example/path', body: 'private', extra: { anything: 'private' } };
  const sanitized = recovery.sanitizePushRecoveryLog({ level: 'info', message: mockInfo.mock.calls[0][0], attributes });
  expect(sanitized?.attributes).toEqual(mockInfo.mock.calls[0][1]);
  expect(recovery.sanitizePushRecoveryLog({ level: 'info', message: 'other', attributes })).toBeNull();
  expect(recovery.sanitizePushRecoveryLog({ level: 'error', message: mockInfo.mock.calls[0][0], attributes })).toBeNull();
  expect(recovery.sanitizePushRecoveryLog({ level: 'info', message: mockInfo.mock.calls[0][0], attributes: {} })).toBeNull();
});
test('SDK scope attributes cannot bypass the whitelist', () => {
  recover(); mockScopeData.mockReturnValue({ attributes: { secret: 'not approved' } });
  expect(recovery.sanitizePushRecoveryLog({ level: 'info', message: mockInfo.mock.calls[0][0], attributes: mockInfo.mock.calls[0][1] })).toBeNull();
});
