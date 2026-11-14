import test from 'node:test';
import assert from 'node:assert/strict';
import { captureSentryMonitorHistory } from '../supabase/functions/operational-health/sentry-monitor-history.ts';
import { stagingSentryChecksUrl, stagingSentryMonitorUrl } from '../supabase/functions/_shared/sentry-monitor-contract.ts';

const config = { enabled: 'true', historyEnabled: 'true', environment: 'staging',
  supabaseUrl: 'https://ohrcupagdoilkwhecict.supabase.co', token: 'synthetic' };
test('native response import retains provider source time and never calls a real service', async () => {
  const now = Date.parse('2026-11-05T03:00:00Z'), writes: Record<string, unknown>[] = [];
  const upstream: typeof fetch = async (url, init) => {
    assert.equal(init?.redirect, 'error');
    if (url === stagingSentryMonitorUrl) return Response.json({ id: '10858429', projectSlug: 'doji-staging',
      environment: 'staging', method: 'GET', status: 'active', intervalSeconds: 60,
      url: config.supabaseUrl + '/functions/v1/operational-health/monitor-check' });
    assert.equal(url, stagingSentryChecksUrl);
    return Response.json([{ uptimeCheckId: '9763b4555dc855779ac9dd504193fdea',
      timestamp: '2026-11-05T02:59:00Z', environment: '', checkStatus: 'success', httpStatusCode: 200 }]);
  };
  const result = await captureSentryMonitorHistory(config, async args => { writes.push(args); return {}; }, upstream, () => now);
  assert.equal(result, 'processed'); assert.equal(writes.length, 1);
  assert.equal(writes[0]!.p_observed_at, '2026-11-05T02:59:00.000Z');
});

test('native stalled response stream is cancelled at the overall deadline without a database write', async () => {
  let cancelled = false, writes = 0;
  const upstream: typeof fetch = async () => new Response(new ReadableStream({ cancel() { cancelled = true; } }));
  const result = await captureSentryMonitorHistory(config, async () => { writes++; return {}; }, upstream);
  assert.equal(result, 'unavailable'); assert.equal(cancelled, true); assert.equal(writes, 0);
});
