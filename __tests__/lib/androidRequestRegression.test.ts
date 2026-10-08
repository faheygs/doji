import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { transformSync } from '@babel/core';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { boundedSupabaseFetch } from '../../lib/supabaseFetch';
import { runMemberRead } from '../../lib/runMemberRead';
import { executeCommand } from '../../lib/commandGateway';
import { supabase } from '../../lib/supabase';
import { mobileReleaseIdentity } from '../../lib/releaseIdentity';

jest.mock('../../lib/supabase', () => ({ supabase: { auth: {
  getSession: jest.fn().mockResolvedValue({ data: { session: { access_token: 'synthetic-token' } } }),
} } }));
jest.mock('../../lib/releaseIdentity', () => ({ mobileReleaseIdentity: () => ({
  platform: 'android', appVersion: 'synthetic', nativeBuildNumber: 'synthetic', releaseChannel: 'test',
}) }));
jest.mock('../../lib/apiFailureTelemetry', () => ({ ...jest.requireActual('../../lib/apiFailureTelemetry'), reportApiFailure: jest.fn() }));

// Execute the real historical source, not a guessed replacement implementation.
// This is a source comparison, not a claim this commit is an accepted device APK.
// Fixtures are verbatim 5458824 source (Supabase fixture extracts only fetch).
// Checked-in text fixtures keep shallow CI clones independent of old Git objects.
function historical(path: string): string {
  return readFileSync(resolve(__dirname, '../fixtures/android-17-source', path), 'utf8');
}
function loadSource(source: string): any {
  const code = transformSync(source, { filename: 'historical.ts', babelrc: false, configFile: false,
    presets: ['@babel/preset-typescript'], plugins: ['@babel/plugin-transform-modules-commonjs'] })?.code;
  if (!code) throw new Error('Historical source did not compile');
  const module = { exports: {} };
  const imports: Record<string, unknown> = {
    './supabase': { supabase }, './releaseIdentity': { mobileReleaseIdentity },
    './telemetry': { reportRealtimeFailure: jest.fn() },
  };
  new Function('module', 'exports', 'require', '__DEV__', code)(module, module.exports, (name: string) => {
    if (!(name in imports)) throw new Error(`Unexpected historical import: ${name}`);
    return imports[name];
  }, false);
  return module.exports;
}
const legacySignals = loadSource(historical('requestSignal.ts.txt'));
const legacyCommands = loadSource(historical('commandGateway.ts.txt'));
const legacyFetch = loadSource(historical('supabaseFetch.ts.txt')).boundedFetch;
const originalFetch = global.fetch, originalPlatform = Platform.OS;
const originalGateway = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
beforeEach(() => {
  jest.useFakeTimers();
  Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
  process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = 'https://synthetic.invalid';
});
afterEach(() => {
  global.fetch = originalFetch;
  Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform });
  if (originalGateway === undefined) delete process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL;
  else process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL = originalGateway;
  jest.useRealTimers();
});
function wire(input: RequestInfo | URL, init: RequestInit) {
  return { url: String(input), method: init.method, body: init.body,
    headers: Object.fromEntries(new Headers(init.headers).entries()) };
}
test.each([200, 504])('old/new actual Supabase POST sends the same request and preserves HTTP %s', async status => {
  const dispatches: unknown[][] = [];
  for (const legacy of [true, false]) {
    const sent: unknown[] = []; dispatches.push(sent);
    global.fetch = jest.fn(async (url, init) => {
      sent.push(wire(url, init!));
      return new Response(status === 200 ? '{"user_event":null}' : 'Gateway Timeout', { status });
    });
    const db = createClient('https://synthetic.invalid', 'synthetic-key', {
      accessToken: async () => 'synthetic-token', global: { fetch: legacy ? legacyFetch : boundedSupabaseFetch },
    });
    const run = legacy ? legacySignals.runAbortableQuery : runMemberRead;
    const result = await run(db.rpc('get_current_doji_state'), undefined, 6000)
      .then((value: any) => { if (value.error) throw value.error; return value; }).catch((error: unknown) => ({ error }));
    expect(Boolean(result.error)).toBe(status === 504);
    expect(sent).toHaveLength(1);
    expect(jest.getTimerCount()).toBe(0);
  }
  expect(dispatches[1]).toEqual(dispatches[0]);
});
test.each([true, false])('old/new keyed friend command has identical 504 retry behavior (recovery=%s)', async recover => {
  const dispatches: unknown[][] = [];
  for (const execute of [legacyCommands.executeCommand, executeCommand]) {
    const sent: unknown[] = []; dispatches.push(sent);
    global.fetch = jest.fn(async (url, init) => {
      sent.push(wire(url, init!));
      const success = recover && sent.length === 2;
      return new Response(success ? '{"id":"synthetic-friendship"}' : 'Gateway Timeout', { status: success ? 200 : 504 });
    });
    const pending = execute('request_friendship', { p_addressee_id: 'synthetic-user', p_idempotency_key: 'synthetic-intent' });
    await jest.advanceTimersByTimeAsync(250);
    const result = await pending;
    expect(Boolean(result.error)).toBe(!recover);
    expect(sent).toHaveLength(2);
    expect(jest.getTimerCount()).toBe(0);
  }
  expect(dispatches[1]).toEqual(dispatches[0]);
});
