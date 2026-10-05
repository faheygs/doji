import { registerRootComponent } from 'expo';
import { fetch as expoFetch } from 'expo/fetch';
import * as FileSystem from 'expo-file-system/legacy';
import { createClient } from '@supabase/supabase-js';
import React, { useEffect, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { boundedSupabaseFetch } from '../../lib/supabaseFetch';
import { runMemberRead } from '../../lib/runMemberRead';
import { readFailureDiagnostics } from '../../lib/memberReadDiagnostics';
const { cases } = require('../member-api-audit/cases.cjs');

// No Sentry initialization, app screens, persisted session, credentials in bundle,
// retries or live social/economy commands. Output contains no payloads or identity.
const origin = 'https://tvixsmqxotuvyjqzmjla.supabase.co';
const gateway = 'https://doji-orchestrator.faheygs.workers.dev';
const rpc = new Set(['get_own_profile', 'get_current_doji_state', 'get_upcoming_doji_state',
  'get_mobile_release_policy', 'get_my_moderation_status', 'get_current_profile_post',
  'get_reactions_given_count', 'friend_count', 'friend_request_count', 'blocked_user_count',
  'list_my_friends_page', 'list_friend_requests_page', 'list_blocked_users_page',
  'list_profile_friends_page', 'get_public_profile_view', 'is_username_available',
  'search_profiles', 'search_mentionable_profiles', 'get_leaderboard_snapshot']);
const tables = new Set(['shop_items', 'user_shop_items', 'challenge_suggestions', 'badges',
  'user_badges', 'badge_categories', 'badge_tiers', 'user_badge_progress', 'poll_votes', 'user_events']);
function ensure(value: unknown) { if (!value) throw new Error('Canary guard failed'); }
async function run() {
  ensure(Platform.OS === 'android' && Platform.Version === 30);
  ensure(Object.is(global.fetch, expoFetch));
  const credentialPath = FileSystem.documentDirectory + 'canary.json';
  const config = JSON.parse(await FileSystem.readAsStringAsync(credentialPath));
  await FileSystem.deleteAsync(credentialPath);
  const { member, key } = config;
  ensure(member.synthetic === true && member.state === 'created');
  ensure(member.project === 'tvixsmqxotuvyjqzmjla');
  ensure(/^doji-android-qa-[a-f0-9]+@test\.invalid$/.test(member.email));
  let authPhase = true, budget = 40;
  let requests: any[] = [];
  const guardedFetch = async (input: any, init: any = {}) => {
    const url = new URL(String(input)); const method = (init.method || 'GET').toUpperCase();
    const auth = authPhase && url.origin === origin && url.pathname === '/auth/v1/token'
      && url.searchParams.get('grant_type') === 'password' && method === 'POST';
    const read = !authPhase && url.origin === origin && (
      (method === 'POST' && url.pathname.startsWith('/rest/v1/rpc/') && rpc.has(url.pathname.slice(13))) ||
      (['GET', 'HEAD'].includes(method) && url.pathname.startsWith('/rest/v1/') && tables.has(url.pathname.slice(9))));
    const edge = !authPhase && method === 'GET' && url.origin === gateway &&
      /^\/v1\/(profiles\/[^/]+|feed\/[a-f0-9-]{36}|polls\/[a-f0-9-]{36}\/summary)$/.test(url.pathname);
    ensure((auth || read || edge) && budget-- > 0);
    const started = Date.now();
    const response = await boundedSupabaseFetch(input, init);
    requests.push({ status: response.status, headersMs: Date.now() - started,
      nativeSource: response.headers.get('x-doji-native-response-source') });
    return response;
  };
  const client = createClient(origin, key, { auth: { persistSession: false,
    autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: guardedFetch } });
  const login = await client.auth.signInWithPassword({ email: member.email, password: member.password });
  ensure(!login.error && login.data.user?.id === member.id);
  authPhase = false;
  const checks = cases(client, member);
  checks.push({ name: 'ownOccurrenceFixture', timeout: 8000,
    make: () => client.from('user_events').select('daily_event_id,status').eq('user_id', member.id)
      .order('created_at', { ascending: false }).limit(1) });
  const edgeCheck = (name: string, path: string) => checks.push({ name, timeout: 8000,
    make: () => ({ retry: () => {}, abortSignal: async (signal: AbortSignal) => {
      const response = await guardedFetch(gateway + path, { signal,
        headers: { authorization: `Bearer ${login.data.session!.access_token}`, accept: 'application/json' } });
      const data = await response.json();
      return { status: response.status, error: response.ok ? null : { code: 'HTTP_ERROR' }, data };
    } }) });
  edgeCheck('gateway.publicProfile', `/v1/profiles/${encodeURIComponent(member.username)}`);
  const results: any[] = [];
  for (const check of checks) {
    requests = []; const started = Date.now(); let result;
    try {
      const response: any = await runMemberRead(check.make(), undefined, check.timeout);
      if (check.name === 'ownOccurrenceFixture') {
        const eventId = response.data?.[0]?.daily_event_id;
        if (/^[a-f0-9-]{36}$/.test(eventId || '')) for (const audience of ['friends', 'everyone']) {
          edgeCheck(`gateway.feed.${audience}.locked`, `/v1/feed/${eventId}?audience=${audience}&unlocked=false&limit=20&offset=0`);
          edgeCheck(`gateway.pollSummary.${audience}`, `/v1/polls/${eventId}/summary?audience=${audience}`);
        }
      }
      result = { name: check.name, ok: true, status: response.status };
    } catch (error: any) {
      const hints = readFailureDiagnostics(error);
      result = { name: check.name, ok: false, status: requests.at(-1)?.status ?? null,
        hints: hints ? { stage: hints.stage, response_status: hints.response_status,
          native_response_source: hints.native_response_source, cache_only_signature: hints.cache_only_signature } : null };
    }
    results.push({ ...result, totalMs: Date.now() - started, requests });
    console.log('DOJI_CANARY_STEP ' + JSON.stringify(results.at(-1)));
    if (!result.ok) break;
  }
  const evidence = { at: new Date().toISOString(), api: Platform.Version,
    runtime: 'Hermes, installed Expo fetch, actual member read wrappers; local canary, not store APK',
    scope: 'synthetic member; no retries; state RPC may reconcile QA occurrence; Sentry not initialized',
    results };
  await FileSystem.writeAsStringAsync(FileSystem.documentDirectory + 'result.json', JSON.stringify(evidence));
  return `${results.length} checks, ${results.filter(r => !r.ok).length} failures`;
}
let started = false;
function App() {
  const [status, setStatus] = useState('Starting bounded API 30 canary');
  useEffect(() => { if (!started) { started = true; run().then(setStatus).catch(() => {
    console.log('DOJI_CANARY_FATAL'); setStatus('Stopped: guard, auth or setup failure');
  }); } }, []);
  return <View><Text>{status}</Text></View>;
}
registerRootComponent(App);
