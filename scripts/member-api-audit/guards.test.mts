import assert from 'node:assert/strict';
import test from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { allowed } from './run.mts';
import { cases } from './cases.mts';
const origin = 'https://tvixsmqxotuvyjqzmjla.supabase.co';
test('canary refuses writes, foreign hosts and auth refresh', () => {
  for (const [url, method, auth] of [
    [origin + '/rest/v1/rpc/request_friendship', 'POST', false],
    [origin + '/rest/v1/rpc/claim_active_app_announcement', 'POST', false],
    [origin + '/rest/v1/shop_items', 'POST', false],
    [origin + '/rest/v1/user_shop_items', 'DELETE', false],
    ['https://foreign.invalid/rest/v1/shop_items', 'GET', false],
    ['https://doji-orchestrator.faheygs.workers.dev/commands/rpc/request_friendship', 'POST', false],
    [origin + '/auth/v1/token?grant_type=refresh_token', 'POST', true],
  ] as const) assert.equal(allowed(url, method, auth), false);
  assert.equal(allowed(origin + '/auth/v1/token?grant_type=password', 'POST', true), true);
});
test('all cases emit only explicitly allowed reads; no network', async () => {
  let count = 0;
  const client = createClient(origin, 'offline-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (url, init) => {
      assert.ok(allowed(String(url), init?.method||'GET', false)); count++;
      return new Response(init?.method === 'HEAD' ? null : '[]', {
        status: 200, headers: { 'content-type': 'application/json', 'content-range': '0-0/0' },
      });
    } },
  });
  for (const check of cases(client, { id: '00000000-0000-0000-0000-000000000001', username: 'synthetic' })) {
    assert.ok(!(await check.make().retry(false)).error);
  }
  assert.equal(count, 31);
});
