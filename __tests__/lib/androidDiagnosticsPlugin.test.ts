const mockMain = jest.fn((config, callback) => { config.mainCallback = callback; return config; });
const mockDangerous = jest.fn((config, action) => { config.dangerousAction = action; return config; });
const mockCopy = jest.fn();
const mockMkdir = jest.fn();
const mockPatchExpo = jest.fn();
jest.mock('../../plugins/android-read-diagnostics/expoClientPatch.cts', () => ({ patchExpoClient: mockPatchExpo }));
jest.mock('@expo/config-plugins', () => ({ withMainApplication: mockMain, withDangerousMod: mockDangerous }));
jest.mock('node:fs', () => ({ copyFileSync: mockCopy, mkdirSync: mockMkdir }));
const plugin = require('../../plugins/withAndroidReadDiagnostics.cts');
const install = 'com.doji.network.DojiReadResponseHints.install("tvixsmqxotuvyjqzmjla.supabase.co", "doji-orchestrator.faheygs.workers.dev")';

test('injects one Android-only installer before native startup and is idempotent', () => {
  const source = 'override fun onCreate() {\n super.onCreate()\n loadReactNative(this)\n}';
  const result = plugin.instrumentMainApplication(source, 'kt');
  expect(result.indexOf(install)).toBeLessThan(result.indexOf('loadReactNative'));
  expect(plugin.instrumentMainApplication(result, 'kt')).toBe(result);
  expect(result.split(install)).toHaveLength(2);
});

test.each([
  ['super.onCreate()', 'java'],
  ['no lifecycle hook', 'kt'],
  ['super.onCreate(); super.onCreate()', 'kt'],
  ['super.onCreate(); setCustomClientBuilder(other)', 'kt'],
  ['super.onCreate(); setOkHttpClientFactory(other)', 'kt'],
  ['super.onCreate(); DojiReadResponseHints.other()', 'kt'],
])('fails closed on an unreviewed application template', (source, language) => {
  expect(() => plugin.instrumentMainApplication(source, language)).toThrow();
});

test('migrates the exact old installer without duplicates or overwriting another factory', () => {
  const old = 'com.doji.network.DojiReadResponseHints.install("tvixsmqxotuvyjqzmjla.supabase.co")';
  const source = `super.onCreate()\n${old}\nloadReactNative(this)`;
  const result = plugin.instrumentMainApplication(source, 'kt');
  expect(result).toContain(install);
  expect(result).not.toContain(old);
  expect(plugin.instrumentMainApplication(result, 'kt')).toBe(result);
  expect(() => plugin.instrumentMainApplication(`${source}\n${old}`, 'kt')).toThrow();
  expect(() => plugin.instrumentMainApplication(`${source}\nsetOkHttpClientFactory(other)`, 'kt')).toThrow();
  expect(() => plugin.instrumentMainApplication(`${result}\nsetOkHttpClientFactory(other)`, 'kt')).toThrow();
  expect(() => plugin.instrumentMainApplication(`${result}\n${install}`, 'kt')).toThrow();
});

test('registers only Android mods and copies only the reviewed native helper', async () => {
  const config = plugin({ ios: { buildNumber: '102' } });
  expect(config.ios).toEqual({ buildNumber: '102' });
  expect(config.dangerousAction[0]).toBe('android');
  const mod = { modResults: { language: 'kt', contents: 'super.onCreate()' }, modRequest: { projectRoot: '/synthetic', platformProjectRoot: '/synthetic/android' } };
  expect(config.mainCallback(mod).modResults.contents).toContain(install);
  expect(await config.dangerousAction[1](mod)).toBe(mod);
  expect(mockPatchExpo).toHaveBeenCalledWith('/synthetic', 'tvixsmqxotuvyjqzmjla.supabase.co', 'doji-orchestrator.faheygs.workers.dev');
  expect(mockMkdir).toHaveBeenCalledWith(expect.stringMatching(/app[\\/]src[\\/]main[\\/]java[\\/]com[\\/]doji[\\/]network$/), { recursive: true });
  expect(mockCopy).toHaveBeenCalledWith(expect.stringMatching(/plugins[\\/]android-read-diagnostics[\\/]DojiReadResponseHints.java$/), expect.stringMatching(/com[\\/]doji[\\/]network[\\/]DojiReadResponseHints.java$/));
});
