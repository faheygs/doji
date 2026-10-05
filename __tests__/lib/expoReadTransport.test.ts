import { Platform } from 'react-native';
import { readFileSync } from 'node:fs';
import { beginReadDiagnostics, finishReadDiagnostics, observedMemberFetch, readFailureDiagnostics } from '../../lib/memberReadDiagnostics';

// Installed Expo JS executes; only its JSI/native boundary is synthetic.
// The emulator test separately exercises the real provider factory.
const mockStart = jest.fn();
const mockCancel = jest.fn();
jest.mock('expo/src/winter/fetch/ExpoFetchModule', () => ({ ExpoFetchModule: {
  NativeResponse: class {
    raw: string[][] = [];
    get status() { return 504; }
    get statusText() { return 'Gateway Timeout'; }
    get _rawHeaders() { return this.raw; }
    addListener() { return { remove() {} }; }
    removeListener() {}
    removeAllListeners() {}
    async text() { return 'synthetic body'; }
  },
  NativeRequest: class {
    response: any;
    constructor(response: any) { this.response = response; }
    async start(url: string, init: any, body: any) { return mockStart(this.response, url, init, body); }
    cancel() { mockCancel(); }
  },
} }));
const expoFetch = jest.requireActual('expo/src/winter/fetch/fetch').fetch;
const originalFetch = global.fetch;
const originalPlatform = Platform.OS;
afterEach(() => { global.fetch = originalFetch; Object.defineProperty(Platform, 'OS', { value: originalPlatform }); jest.clearAllMocks(); });

test('installed Expo default uses its provider rather than RN NetworkingModule hook', () => {
  const runtime = readFileSync(require.resolve('expo/src/winter/runtime.native.ts'), 'utf8');
  const native = readFileSync('node_modules/expo/android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt', 'utf8');
  expect(runtime).toContain("install('fetch', () => require('./fetch').fetch)");
  expect(native).toContain('OkHttpClientProvider.createClient(reactContext)');
  expect(native).not.toContain('setCustomClientBuilder');
});

test.each(['supabase', 'scale_gateway'] as const)('actual Expo FetchResponse preserves native evidence for %s without reading the body', async transport => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  let receivedResponse: any;
  mockStart.mockImplementation(async (response) => {
    receivedResponse = response;
    response.raw = [['x-doji-native-read-version', '2'], ['x-doji-native-response-source', 'network'],
      ['x-doji-native-request-cache-only', 'false'], ['x-doji-native-protocol', 'http/1.1'],
      ['x-doji-native-network-headers-ms', '17']];
  });
  global.fetch = expoFetch;
  const controller = new AbortController();
  beginReadDiagnostics(controller.signal, transport);
  const result = await observedMemberFetch('https://synthetic.invalid/v1/feed/test', {
    signal: controller.signal, headers: { authorization: 'Bearer synthetic' },
  });
  const error = new Error('synthetic');
  finishReadDiagnostics(controller.signal, error);
  expect(result).toBe(receivedResponse);
  expect(result.statusText).toBe('Gateway Timeout');
  expect(readFailureDiagnostics(error)).toMatchObject({ transport, native_response_source: 'network',
    native_protocol: 'http/1.1', native_network_headers_ms: 17, body_state: 'unread', response_type: 'missing' });
  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(mockStart.mock.calls[0][2]).toMatchObject({ method: 'GET', credentials: 'include', redirect: 'follow' });
  expect(mockStart.mock.calls[0][2].headers).toContainEqual(['authorization', 'Bearer synthetic']);
  expect(mockCancel).not.toHaveBeenCalled();
});
