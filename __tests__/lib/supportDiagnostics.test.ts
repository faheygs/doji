import { supportDiagnosticDetails, supportEmailUrl } from '../../lib/supportDiagnostics';
const mockSnapshot = jest.fn();
const mockRelease = jest.fn();
jest.mock('../../lib/mobileDiagnosticContext', () => ({ mobileDiagnosticSnapshot: () => mockSnapshot() }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => mockRelease() }));
beforeEach(() => {
  mockSnapshot.mockReturnValue({ installation_id: 'diag:installation-123456', session_id: 'diag:session-123456',
    actor: 'private-member', email: 'private@example.com', token: 'private-secret', screen: 'private-route', network_type: 'WIFI' });
  mockRelease.mockReturnValue({ appVersion: '1.0.9', nativeBuildNumber: '104', platform: 'ios', releaseChannel: 'private-channel' });
});
test('support preview includes only the explicitly allowed diagnostic references and installed release', () => {
  expect(supportDiagnosticDetails()).toBe('Doji version: 1.0.9\nBuild: 104\nPlatform: ios\nDiagnostic installation: diag:installation-123456\nDiagnostic session: diag:session-123456');
  expect(supportDiagnosticDetails()).not.toMatch(/private|WIFI/);
});
test('missing or malformed references are unavailable, never invented or copied unsanitized', () => {
  mockSnapshot.mockReturnValue({ installation_id: 'someone@example.com', session_id: 'https://secret.test' });
  mockRelease.mockReturnValue({ platform: 'private', appVersion: 'private', nativeBuildNumber: null });
  expect(supportDiagnosticDetails()).toBe('Doji version: Unknown\nBuild: Unknown\nPlatform: Unknown\nDiagnostic installation: Unavailable\nDiagnostic session: Unavailable');
});
test('email draft is addressed only to support and safely encodes the visible details', () => {
  const details = supportDiagnosticDetails();
  const url = supportEmailUrl(details);
  expect(url.startsWith('mailto:support@dojipro.com?')).toBe(true);
  const query = new URLSearchParams(url.split('?')[1]);
  expect(query.get('subject')).toBe('Doji app problem');
  expect(query.get('body')).toContain(details);
  expect([...query.keys()]).toEqual(['subject', 'body']);
});
