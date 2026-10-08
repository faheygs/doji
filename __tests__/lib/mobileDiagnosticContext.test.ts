jest.mock('react-native', () => {
  const native = jest.requireActual('react-native');
  Object.defineProperty(native.Platform, 'OS', { configurable: true, writable: true, value: 'ios' });
  return native;
});

type Context = typeof import('../../lib/mobileDiagnosticContext');
let context: Context;
let storage: typeof import('@react-native-async-storage/async-storage').default;
beforeEach(() => {
  jest.clearAllMocks();
  jest.isolateModules(() => {
    const loaded = require('@react-native-async-storage/async-storage');
    storage = loaded.default ?? loaded;
    (storage.getItem as jest.Mock).mockResolvedValue(null);
    (storage.setItem as jest.Mock).mockResolvedValue(undefined);
    context = require('../../lib/mobileDiagnosticContext');
  });
  require('react-native').Platform.OS = 'ios';
});

test.each(['ios', 'android'])('separate persistent installation, per-account session, no personal identifiers (%s)', async platform => {
  require('react-native').Platform.OS = platform;
  await Promise.all([context.initializeDiagnosticInstallation(), context.initializeDiagnosticInstallation()]);
  expect(storage.getItem).toHaveBeenCalledTimes(1);
  expect(storage.setItem).toHaveBeenCalledTimes(1);
  const initial = context.mobileDiagnosticSnapshot();
  expect(initial.installation_id).toMatch(/^diag:/);
  expect(initial.installation_storage).toBe('persisted');
  context.setDiagnosticActor('private-user-A');
  context.recordDiagnosticOutcome('feed', 'failed', 2);
  const a = context.mobileDiagnosticSnapshot();
  context.setDiagnosticActor('private-user-A');
  expect(context.mobileDiagnosticSnapshot().session_id).toBe(a.session_id);
  context.setDiagnosticActor('private-user-B');
  const b = context.mobileDiagnosticSnapshot();
  expect(b.installation_id).toBe(a.installation_id);
  expect(b.session_id).not.toBe(a.session_id);
  expect(context.diagnosticSessionIsCurrent(a.session_id)).toBe(false);
  expect(context.diagnosticTimeline()).toHaveLength(1);
  expect(JSON.stringify([b, context.diagnosticTimeline()])).not.toMatch(/private|user-A|user-B/);
  context.setDiagnosticActor(null);
  expect(context.mobileDiagnosticSnapshot().authenticated).toBe(false);
});

test('valid installation reuses storage; malformed values are never sent', async () => {
  (storage.getItem as jest.Mock).mockResolvedValue('diag:existing-valid-installation-123456789');
  await context.initializeDiagnosticInstallation();
  expect(context.mobileDiagnosticSnapshot().installation_id).toBe('diag:existing-valid-installation-123456789');
  expect(storage.setItem).not.toHaveBeenCalled();
});

test.each(['read', 'write', 'invalid'])('storage %s failure cannot block startup or leak saved content', async mode => {
  if (mode === 'read') (storage.getItem as jest.Mock).mockRejectedValue(Error('private storage error'));
  if (mode === 'write') (storage.setItem as jest.Mock).mockRejectedValue(Error('private storage error'));
  if (mode === 'invalid') (storage.getItem as jest.Mock).mockResolvedValue('private@example.com');
  await expect(context.initializeDiagnosticInstallation()).resolves.toBeUndefined();
  expect(context.mobileDiagnosticSnapshot().installation_id).toMatch(/^diag:/);
  expect(JSON.stringify(context.mobileDiagnosticSnapshot())).not.toContain('private');
  expect(context.mobileDiagnosticSnapshot().installation_storage).toBe(mode === 'invalid' ? 'persisted' : 'memory_only');
});

test('allowlisted route templates, network observations and bounded detached history exclude raw data', () => {
  context.setDiagnosticScreen(['(app)', 'member', '[username]']);
  expect(context.mobileDiagnosticSnapshot().screen).toBe('(app)/member/[username]');
  context.setDiagnosticScreen(['(app)', 'member', 'private-person']);
  expect(context.mobileDiagnosticSnapshot().screen).toBe('other');
  context.observeDiagnosticNetwork({ type: 'private-SSID', isConnected: 'secret', isInternetReachable: true });
  expect(context.mobileDiagnosticSnapshot()).toMatchObject({ network_type: 'UNKNOWN', network_connected: 'unknown', network_reachable: true });
  for (let index = 0; index < 100; index++) context.recordDiagnosticOutcome('private-query-key', 'failed', 500);
  const history = context.diagnosticTimeline();
  expect(history).toHaveLength(24);
  expect(history[0].data).toMatchObject({ operation: 'other', attempts: 100 });
  history[0].data.operation = 'private-modification';
  expect(JSON.stringify([context.mobileDiagnosticSnapshot(), context.diagnosticTimeline()])).not.toMatch(/private|secret/);
});

test('SDK-native context whitelist keeps model/OS/resources, not names, IPs, identifiers or arbitrary contexts', () => {
  expect(context.safeNativeDiagnosticContexts({ device: { model: 'iPhone 17', name: 'private person phone',
    id: 'private-hardware-id', battery_level: 30, free_memory: 1234, ip_address: '192.0.2.1', simulator: false },
    os: { name: 'iOS', version: '26.1', private: 'secret' }, app: { app_build: '104', app_name: 'private' },
    arbitrary: { value: 'private' } })).toEqual({ device: { model: 'iPhone 17', battery_level: 30, free_memory: 1234, simulator: false },
    os: { name: 'iOS', version: '26.1' }, app: { app_build: '104' } });
});

test('web has no installation storage, native context or timeline collection', async () => {
  require('react-native').Platform.OS = 'web';
  await context.initializeDiagnosticInstallation();
  context.recordDiagnosticOutcome('feed', 'failed', 1);
  expect(storage.getItem).not.toHaveBeenCalled();
  expect(context.mobileDiagnosticSnapshot()).toEqual({});
  expect(context.diagnosticTimeline()).toEqual([]);
});
