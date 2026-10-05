import { registerRootComponent, requireOptionalNativeModule } from 'expo';
import { fetch as expoFetch } from 'expo/fetch';
import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import * as Sentry from '@sentry/react-native';
import { beginReadDiagnostics, finishReadDiagnostics, observedMemberFetch, readFailureDiagnostics } from '../../lib/memberReadDiagnostics';
import { reportApiFailure, sanitizeApiFailureEvent } from '../../lib/apiFailureTelemetry';
import { androidTestLabStatus } from '../../lib/androidTestEnvironment';

// Real Expo/Hermes/JSI and real app telemetry code; no mock fetch or JSI boundary.
// Android manifest removes INTERNET permission. Cache-only requests cannot leave
// the device, and Sentry envelopes go only to this in-memory transport.
const events: any[] = [];
const assertions: string[] = [];
function check(value: unknown, label: string): asserts value {
  if (!value) throw new Error(`Probe assertion failed: ${label}`);
  assertions.push(label);
}

async function run() {
  check(!__DEV__, 'release JavaScript executes production telemetry branch');
  check(Platform.OS === 'android', 'Android native runtime');
  check(Object.is(global.fetch, expoFetch), 'default global fetch is installed Expo fetch');
  const nativeEnvironment = requireOptionalNativeModule<{ firebaseTestLab: string }>('DojiTestEnvironment');
  check(nativeEnvironment !== null, 'real Android test environment module is linked');
  const testLab = androidTestLabStatus();
  check(['detected', 'not_detected', 'unknown'].includes(testLab!), 'bounded native test environment');
  check(testLab === nativeEnvironment.firebaseTestLab, 'real native attribution reaches JS');
  Sentry.init({
    dsn: 'https://synthetic@localhost/1', enableNative: false,
    enableNativeCrashHandling: false, autoInitializeNativeSdk: false,
    defaultIntegrations: false, sendClientReports: false,
    beforeSend: sanitizeApiFailureEvent,
    transport: () => ({
      send: async envelope => {
        for (const [header, payload] of envelope[1]) if (header.type === 'event') events.push(payload);
        return { statusCode: 200 };
      },
      flush: async () => true,
    }),
  });

  for (const [transport, host, path, operation, method] of [
    ['supabase', 'tvixsmqxotuvyjqzmjla.supabase.co', '/rest/v1/doji_offline_probe', 'ownedShopItems', 'GET'],
    ['scale_gateway', 'doji-orchestrator.faheygs.workers.dev', '/v1/feed/doji_offline_probe', 'feed', 'GET'],
    ['supabase', 'tvixsmqxotuvyjqzmjla.supabase.co', '/rest/v1/rpc/get_current_doji_state', 'userEvent', 'POST'],
    ['command_gateway', 'doji-orchestrator.faheygs.workers.dev', '/commands/rpc/request_friendship', 'request_friendship', 'POST'],
  ] as const) {
    const controller = new AbortController();
    beginReadDiagnostics(controller.signal, transport);
    const response = await observedMemberFetch(`https://${host}${path}`, {
      signal: controller.signal,
      method,
      ...(method === 'POST' ? { body: '{}' } : {}),
      headers: { 'Cache-Control': 'only-if-cached, max-stale=0' },
    });
    check(response.status === 504, `${transport}: actual native cache-only 504`);
    check(response.headers.get('x-doji-native-read-version') === (method === 'POST' ? '3' : '2'), `${transport}: native version crosses Expo JSI`);
    const failure = Object.assign(new Error('synthetic private text must not leave formatter'), { status: 504 });
    finishReadDiagnostics(controller.signal, failure);
    const data = readFailureDiagnostics(failure);
    check(data?.native_response_source === 'local_cache_miss', `${transport}: native provenance reaches app diagnostics`);
    check(data.native_request_cache_only === true, `${transport}: cache-only evidence retained`);
    check(data.body_state === 'unread', `${transport}: observer did not consume body`);
    check(data.native_network_headers_ms === undefined, `${transport}: no fabricated network timing`);
    check(data.fetch_invocations === 1, `${transport}: no extra fetch`);
    reportApiFailure(transport === 'command_gateway' ? 'command' : 'query', operation, failure);
  }
  await Sentry.flush();
  check(events.length === 4, 'four locally captured final Sentry events');
  for (const event of events) {
    check(event.tags?.firebase_test_lab === testLab, 'test attribution survives Sentry normalization without dropping error');
    check(event.contexts?.api?.native_response_source === 'local_cache_miss', 'native provenance survives Sentry normalization');
    check(event.contexts.api.native_request_cache_only === true, 'cache-only boolean survives Sentry normalization');
    check(event.contexts.api.body_state === 'unread', 'body state survives Sentry normalization');
    check(!event.user && !event.request && !event.extra, 'private ambient fields removed');
    check(!JSON.stringify(event).includes('synthetic private text'), 'raw failure text excluded');
  }
  return { passed: true, count: assertions.length, assertions, firebaseTestLab: testLab,
    productionTraffic: false, productionRootCauseReproduced: false, nativeBridgeMocked: false };
}

function Probe() {
  const [result, setResult] = useState('Running offline Expo native read probe');
  useEffect(() => {
    void run().then(value => {
      const text = JSON.stringify(value);
      console.log(`DOJI_EXPO_READ_PROBE ${text}`);
      setResult(text);
    }).catch(error => {
      const text = JSON.stringify({ passed: false, count: assertions.length, error: String(error) });
      console.error(`DOJI_EXPO_READ_PROBE ${text}`);
      setResult(text);
    });
  }, []);
  return <View><Text testID="doji-offline-probe-result">{result}</Text></View>;
}

registerRootComponent(Probe);
