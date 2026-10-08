import * as Sentry from '@sentry/react-native';
import { Platform } from 'react-native';
import { initializeDiagnosticInstallation } from '../../lib/mobileDiagnosticContext';
import { setDiagnosticActor, syncMobileDiagnosticTags } from '../../lib/mobileDiagnosticSentry';
jest.mock('@sentry/react-native', () => ({ setTag: jest.fn() }));
const originalOS = Platform.OS;
beforeEach(() => { jest.clearAllMocks(); Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' }); });
afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalOS }); });
test('SDK scope sync contains only independent random correlation IDs', async () => {
  await initializeDiagnosticInstallation();
  setDiagnosticActor('private-member-id');
  const before = (Sentry.setTag as jest.Mock).mock.calls;
  expect(before).toEqual([['diagnostic_installation', expect.stringMatching(/^diag:/)], ['diagnostic_session', expect.stringMatching(/^diag:/)]]);
  const oldSession = before[1][1];
  setDiagnosticActor(null);
  expect((Sentry.setTag as jest.Mock).mock.calls.at(-1)[1]).not.toBe(oldSession);
  expect(JSON.stringify((Sentry.setTag as jest.Mock).mock.calls)).not.toContain('private');
});
test('unavailable SDK cannot interfere with actor updates or startup', () => {
  (Sentry.setTag as jest.Mock).mockImplementationOnce(() => { throw Error('SDK unavailable'); });
  expect(() => syncMobileDiagnosticTags()).not.toThrow();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'web' });
  jest.clearAllMocks(); syncMobileDiagnosticTags(); expect(Sentry.setTag).not.toHaveBeenCalled();
});
