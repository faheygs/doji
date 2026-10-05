import { Platform } from 'react-native';
import { beginReadDiagnostics, finishReadDiagnostics, observedMemberFetch, readFailureDiagnostics } from '../../lib/memberReadDiagnostics';

// Execute the installed RN XHR implementation, not Jest's default XHR mock.
// Only the native event boundary is simulated; no device/network is implied.
const NativeXHR = jest.requireActual('react-native/Libraries/Network/XMLHttpRequest').default;
const originalPlatform = Platform.OS;
const originalFetch = global.fetch;

test('installed RN XHR preserves the first body-read failure and ignores trailing success', () => {
  const xhr = new NativeXHR();
  const onError = jest.fn();
  const onLoad = jest.fn();
  xhr.onerror = onError;
  xhr.onload = onLoad;
  xhr.__didCreateRequest(71);
  xhr.__didReceiveResponse(71, 200, {}, 'https://synthetic.invalid/rest/v1/user_shop_items');
  xhr.__didCompleteResponse(71, 'synthetic incomplete body', false);
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onLoad).not.toHaveBeenCalled();
  // RN native text handling can emit data/success after its body-read error.
  // The actual XHR implementation must already have fenced this request off.
  xhr.__didReceiveData(71, '[]');
  xhr.__didCompleteResponse(71, null, false);
  expect(onError).toHaveBeenCalledTimes(1);
  expect(onLoad).not.toHaveBeenCalled();
});

async function observe(response: Response, transport: 'supabase' | 'scale_gateway' = 'supabase', method?: string, input: RequestInfo | URL = 'https://synthetic.invalid') {
  global.fetch = jest.fn().mockResolvedValue(response);
  const controller = new AbortController();
  beginReadDiagnostics(controller.signal, transport);
  const result = await observedMemberFetch(input, { signal: controller.signal, ...(method ? { method } : {}) });
  const error = new Error('synthetic');
  finishReadDiagnostics(controller.signal, error);
  expect(result).toBe(response);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  return readFailureDiagnostics(error);
}

afterEach(() => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  global.fetch = originalFetch;
});

const nativeHeaders = (source = 'network', cacheOnly = 'false', version = '1') => ({
  'x-doji-native-read-version': version,
  'x-doji-native-response-source': source,
  'x-doji-native-request-cache-only': cacheOnly,
});

test.each(['network', 'cache', 'local_cache_miss', 'unknown'])('Android native %s evidence survives missing reason phrase', async source => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const detail = await observe(new Response(null, { status: 504, headers: nativeHeaders(source, 'true') }));
  expect(detail).toMatchObject({ native_response_source: source, native_request_cache_only: true, status_text_available: false });
  expect(detail).not.toHaveProperty('cache_only_signature');
});

test.each([
  ['ios', 'supabase', 'GET', 504, '1'],
  ['android', 'scale_gateway', 'POST', 504, '1'],
  ['android', 'supabase', 'POST', 504, '1'],
  ['android', 'supabase', 'GET', 500, '1'],
  ['android', 'supabase', 'GET', 504, '3'],
] as const)('ignores native hints outside matching Android read contract (%s/%s/%s/%s/v%s)', async (os, transport, method, status, version) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  const detail = await observe(new Response(null, { status, headers: nativeHeaders('network', 'false', version) }), transport, method);
  expect(detail).not.toHaveProperty('native_response_source');
  expect(detail).not.toHaveProperty('native_request_cache_only');
});

test.each(['supabase', 'scale_gateway'] as const)('captures native provenance on both Android read paths: %s', async transport => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const detail = await observe(new Response(null, { status: 504, statusText: 'Gateway Timeout',
    headers: nativeHeaders('network', 'false', '2') }), transport, 'GET');
  expect(detail).toMatchObject({ transport, native_response_source: 'network', native_request_cache_only: false });
  expect(JSON.stringify(detail)).not.toContain('Gateway Timeout');
});

test('native hint values are bounded and arbitrary strings never leave the device', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const detail = await observe(new Response(null, { status: 504, headers: nativeHeaders('private-origin', 'private-value') }));
  expect(detail).not.toHaveProperty('native_response_source');
  expect(detail).not.toHaveProperty('native_request_cache_only');
  expect(JSON.stringify(detail)).not.toContain('private');
});

test('native evidence respects Request methods and explicit init method overrides', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const response = () => new Response(null, { status: 504, headers: nativeHeaders() });
  const request = new Request('https://synthetic.invalid', { method: 'POST' });
  expect(await observe(response(), 'supabase', undefined, request)).not.toHaveProperty('native_response_source');
  expect(await observe(response(), 'supabase', 'HEAD', request)).toMatchObject({ native_response_source: 'network', native_request_cache_only: false });
  expect(await observe(response(), 'supabase', undefined, new URL('https://synthetic.invalid'))).toHaveProperty('native_response_source', 'network');
});

test('Android native response loses reason phrase; missing evidence must not become a negative cache diagnosis', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const xhr = new NativeXHR();
  xhr.__didCreateRequest(41);
  // NetworkingModule/NetworkEventUtil pass status + headers + URL, NOT message().
  xhr.__didReceiveResponse(41, 504, {}, 'https://synthetic.invalid/rest/v1/user_shop_items');
  expect(xhr.status).toBe(504);
  expect(xhr.statusText).toBeUndefined();
  // Installed whatwg-fetch builds its Response with xhr.statusText (missing => '').
  const response = new Response('', { status: xhr.status, statusText: xhr.statusText });
  expect(response.statusText).toBe('');
  const detail = await observe(response);
  expect(detail).toMatchObject({ response_status: 504, status_text_available: false });
  expect(detail).not.toHaveProperty('cache_only_signature');
});

test.each([
  ['Unsatisfiable Request (only-if-cached)', true],
  ['Gateway Timeout', false],
  ['private arbitrary phrase', false],
] as const)('Android records only the exact signature when a reason phrase is available (%s)', async (statusText, signature) => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const detail = await observe(new Response('', { status: 504, statusText }));
  expect(detail).toMatchObject({ status_text_available: true, cache_only_signature: signature });
  expect(JSON.stringify(detail)).not.toContain(statusText);
});

test('a native Android provider response retains request correlation despite missing reason phrase', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const xhr = new NativeXHR();
  xhr.__didCreateRequest(42);
  const requestId = 'a6881f65-5e24-4fcb-b00d-c34e61cbf63c';
  xhr.__didReceiveResponse(42, 504, { 'sb-request-id': requestId, 'content-type': 'text/html' }, 'https://synthetic.invalid');
  const detail = await observe(new Response('', { status: xhr.status, statusText: xhr.statusText, headers: xhr.responseHeaders }));
  expect(detail).toMatchObject({ response_status: 504, sb_request_id: requestId, response_type: 'html', status_text_available: false });
  expect(detail).not.toHaveProperty('cache_only_signature');
});

test.each(['ios', 'web'] as const)('%s diagnostic contract and fetch result remain unchanged', async os => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
  const detail = await observe(new Response('', { status: 504 }));
  expect(detail).toMatchObject({ cache_only_signature: false });
  expect(detail).not.toHaveProperty('status_text_available');
});

test('non-504 Android responses cannot be classified as the synthetic 504 signature', async () => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  expect(await observe(new Response('[]', { status: 200 }))).toMatchObject({ response_status: 200,
    status_text_available: false, cache_only_signature: false });
});

test.each(['http/1.0', 'http/1.1', 'h2', 'h2_prior_knowledge'])('v2 accepts exact native protocol %s and bounded timings', async protocol => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  expect(await observe(new Response('', { status: 504, headers: { ...nativeHeaders('network', 'false', '2'),
    'x-doji-native-protocol': protocol, 'x-doji-native-network-headers-ms': '236', 'x-doji-native-prior-response-count': '1',
  } }))).toMatchObject({ native_protocol: protocol, native_network_headers_ms: 236, native_prior_response_count: 1 });
});
test.each(['-1', '1.5', 'NaN', '120001', '9999999', 'private', ''])('v2 rejects invalid native numbers %s', async value => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const detail = await observe(new Response('', { status: 504, headers: { ...nativeHeaders('network', 'false', '2'),
    'x-doji-native-protocol': 'private', 'x-doji-native-network-headers-ms': value, 'x-doji-native-prior-response-count': value,
  } }));
  expect(detail).not.toHaveProperty('native_protocol');
  expect(detail).not.toHaveProperty('native_network_headers_ms');
  expect(detail).not.toHaveProperty('native_prior_response_count');
  expect(JSON.stringify(detail)).not.toContain('private');
});
test.each(['cache', 'local_cache_miss', 'unknown'])('no fresh network timing is inferred for %s', async source => {
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  const detail = await observe(new Response('', { status: 504, headers: { ...nativeHeaders(source, 'true', '2'),
    'x-doji-native-protocol': 'h2', 'x-doji-native-network-headers-ms': '15', 'x-doji-native-prior-response-count': '0',
  } }));
  expect(detail).not.toHaveProperty('native_protocol'); expect(detail).not.toHaveProperty('native_network_headers_ms');
  expect(detail).toHaveProperty('native_prior_response_count', 0);
});
