// One bounded synthetic-member read canary. Node transport, NOT Android.
// get_current_doji_state may lazily create/reconcile this QA member's occurrence.
// Member credentials stay in memory; no Sentry import, bodies or identities saved.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createClient } from '@supabase/supabase-js';
import { cases } from './cases.mts';
import type {CanaryResponse,ReadQuery} from './cases.mts';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {evidenceRecord} from '../release-evidence.mts';
const ref = 'tvixsmqxotuvyjqzmjla';
const origin = `https://${ref}.supabase.co`;
const gatewayOrigin = 'https://doji-orchestrator.faheygs.workers.dev';
const rpcNames = new Set(['get_own_profile', 'get_current_doji_state', 'get_upcoming_doji_state',
  'get_mobile_release_policy', 'get_my_moderation_status', 'get_current_profile_post',
  'get_reactions_given_count', 'friend_count', 'friend_request_count', 'blocked_user_count',
  'list_my_friends_page', 'list_friend_requests_page', 'list_blocked_users_page',
  'list_profile_friends_page', 'get_public_profile_view', 'is_username_available',
  'search_profiles', 'search_mentionable_profiles', 'get_leaderboard_snapshot']);
const tables = new Set(['shop_items', 'user_shop_items', 'challenge_suggestions', 'badges',
  'user_badges', 'badge_categories', 'badge_tiers', 'user_badge_progress', 'poll_votes', 'user_events']);
export function allowed(url:string, method:string, authPhase:boolean) {
  const u = new URL(url);
  if (!authPhase && u.origin === gatewayOrigin && method === 'GET') return /^\/v1\/(profiles\/[^/]+|feed\/[a-f0-9-]{36}|polls\/[a-f0-9-]{36}\/summary|posts\/[a-f0-9-]{36}\/engagement)$/.test(u.pathname);
  if (u.origin !== origin) return false;
  if (authPhase) return u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password' && method === 'POST';
  if (u.pathname.startsWith('/rest/v1/rpc/')) return method === 'POST' && rpcNames.has(u.pathname.slice(13));
  return ['GET', 'HEAD'].includes(method) && tables.has(u.pathname.slice(9)) && u.pathname.startsWith('/rest/v1/');
}
async function main() {
  const mode = process.argv[2];
  assert.equal(process.argv.length, 3);
  assert.ok(mode && ['--synthetic-read-canary', '--gateway-only'].includes(mode));
  const member = evidenceRecord(JSON.parse(readFileSync('.artifacts/android-member-test/credentials.json', 'utf8')));
  assert.ok(typeof member.email==='string' && typeof member.password==='string' && typeof member.id==='string' && typeof member.username==='string');
  assert.equal(member.project, ref); assert.equal(member.synthetic, true); assert.equal(member.state, 'created');
  assert.match(member.email, /^doji-android-qa-[a-f0-9]+@test\.invalid$/);
  const env = parseEnv(readFileSync('.env.local', 'utf8'));
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, ''), origin);
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  assert.ok(key && !key.startsWith('sb_secret_'));
  if (key.split('.').length === 3) assert.equal(JSON.parse(Buffer.from(key.split('.')[1]!, 'base64url').toString('utf8')).role, 'anon');
  let authPhase = true, budget = 33;
  let requests:{status:number;headersMs:number}[] = [];
  const client = createClient(origin, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, init = {}) => {
      const method = (init.method || 'GET').toUpperCase();
      assert.ok(allowed(String(url), method, authPhase), 'Request outside approved read/auth allowlist');
      assert.ok(budget-- > 0, 'Request budget exhausted');
      const started = performance.now();
      const response = await fetch(url, { ...init, redirect: 'error',
        signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000) });
      requests.push({ status: response.status, headersMs: Math.round(performance.now() - started) });
      return response;
    } },
  });
  const login = await client.auth.signInWithPassword({ email: member.email, password: member.password });
  assert.ok(!login.error && login.data.user?.id === member.id, 'Synthetic member login failed; no further requests');
  assert.ok(login.data.session);const accessToken=login.data.session.access_token;
  authPhase = false;
  const results:{name:string;ok?:boolean;status?:number|null;code?:string|null;skipped?:string;totalMs?:number;requests?:typeof requests}[] = [];
  const checks:{name:string;timeout:number;make():ReadQuery|Promise<CanaryResponse>}[] = mode === '--gateway-only'
    ? [{ name: 'ownOccurrenceFixture', timeout: 8000, make: () => client.from('user_events')
      .select('daily_event_id,status').eq('user_id', member.id).order('created_at', { ascending: false }).limit(1) }]
    : cases(client, {id:member.id,username:member.username});
  const gateway = (name:string, path:string) => checks.push({ name, timeout: 8000, make: async () => {
    assert.ok(allowed(gatewayOrigin + path, 'GET', false)); assert.ok(budget-- > 0);
    const started = performance.now();
    const response = await fetch(gatewayOrigin + path, { redirect: 'error', signal: AbortSignal.timeout(8000),
      headers: { authorization: `Bearer ${accessToken}`, accept: 'application/json' } });
    requests.push({ status: response.status, headersMs: Math.round(performance.now() - started) });
    // Deadline also covers the small JSON body. Nothing is printed or saved.
    const data = await response.json();
    return { status: response.status, error: response.ok ? null : { code: 'HTTP_ERROR' }, data };
  } });
  if (mode === '--gateway-only') gateway('gateway.publicProfile', `/v1/profiles/${encodeURIComponent(member.username)}`);
  for (const check of checks) {
    requests = []; const started = performance.now(); let result;
    try {
      let query = check.make();
      if ('retry' in query) query = query.retry(false).abortSignal(AbortSignal.timeout(check.timeout));
      const response = await query;
      if (check.name === 'ownOccurrenceFixture' && !response.error) {
        const eventId = Array.isArray(response.data) && response.data[0] ? evidenceRecord(response.data[0]).daily_event_id : null;
        if (typeof eventId==='string' && /^[a-f0-9-]{36}$/.test(eventId)) for (const audience of ['friends', 'everyone']) {
          gateway(`gateway.feed.${audience}.locked`, `/v1/feed/${eventId}?audience=${audience}&unlocked=false&limit=20&offset=0`);
          gateway(`gateway.pollSummary.${audience}`, `/v1/polls/${eventId}/summary?audience=${audience}`);
        }
        else results.push({ name: 'gateway.feedAndPolls', skipped: 'No authorized occurrence fixture' });
      }
      result = { name: check.name, status: response.status, ok: !response.error,
        code: response.error?.code && /^[A-Z0-9_]{1,40}$/.test(response.error.code) ? response.error.code : null };
    } catch { result = { name: check.name, ok: false, status: null, code: 'LOCAL_TRANSPORT_ERROR' }; }
    results.push({ ...result, totalMs: Math.round(performance.now() - started), requests });
    console.log(JSON.stringify(results.at(-1)));
    if (result.status === 504 || (result.status!==null && [401, 403].includes(result.status))) break;
  }
  const at = new Date().toISOString();
  const output = `test-results/member-api-audit/${at.replace(/[:.]/g, '-')}.json`;
  mkdirSync('test-results/member-api-audit', { recursive: true });
  writeFileSync(output, JSON.stringify({ at, runtime: 'Node fetch; not Android',
    scope: 'single synthetic member; sequential read canary; no retries; state RPC may lazily reconcile QA occurrence', results }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ output, tested: results.length, failed: results.filter(r => !r.ok).length }));
}
if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) main().catch(() => { console.error('Read audit stopped; no credentials or raw error printed.'); process.exitCode = 1; });
