// Real workerd execution; synthetic credentials and all outbound I/O intercepted.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
import { Miniflare, Response, Log, LogLevel, convertV4MiniflareOptions } from '../infra/doji-orchestrator/node_modules/miniflare/dist/src/index.js';

const artifact = process.argv[2];
const script = artifact ? await readFile(artifact, 'utf8') : (await build({
  entryPoints: ['infra/doji-orchestrator/src/staging.ts'], bundle: true, write: false,
  format: 'esm', platform: 'neutral', external: ['cloudflare:workers'],
})).outputFiles[0]?.text;
assert.ok(script);
const origin = 'https://ohrcupagdoilkwhecict.supabase.co';
const reports: unknown[] = [], forbidden: string[] = [];
let writerStatus = 204;
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script, compatibilityDate: '2026-08-11', host: '127.0.0.1',
  log: new Log(LogLevel.NONE),
  bindings: { SUPABASE_URL: origin, SUPABASE_ANON_KEY: 'synthetic',
    OUTBOX_RELAY_SECRET: 'synthetic', ORCHESTRATOR_SECRET: 'synthetic',
    DOJI_ENVIRONMENT: 'staging', STAGING_BACKEND_ENABLED: 'true',
    SCALE_CACHE_VERSION: 'staging-v1', ADMIN_PORTAL_ORIGINS: 'https://admin-staging.dojipro.com',
    MONITOR_HISTORY_ENABLED: 'true' },
  durableObjects: { DOJI_EVENT_ALARM: 'DojiEventAlarm', OUTBOX_RELAY_ALARM: 'OutboxRelayAlarm',
    PUSH_FANOUT_ALARM: 'PushFanoutAlarm', DATA_MAINTENANCE_ALARM: 'DataMaintenanceAlarm',
    HEALTH_MONITOR: 'HealthMonitor' },
  outboundService: async request => {
    const url = new URL(request.url);
    if (url.origin === origin && url.pathname === '/functions/v1/operational-health') {
      assert.equal(request.headers.get('x-outbox-secret'), 'synthetic');
      return new Response(JSON.stringify({ healthy: true }), { headers: { 'content-type': 'application/json' } });
    }
    if (url.origin === origin && url.pathname === '/functions/v1/operational-health/monitor-observation') {
      assert.equal(request.headers.get('x-outbox-secret'), 'synthetic');
      assert.equal(request.method, 'POST');
      reports.push(await request.json());
      return new Response(null, { status: writerStatus, headers: { location: 'https://forbidden.invalid/' } });
    }
    forbidden.push(request.url);
    return new Response('Unmocked external request denied', { status: 599 });
  },
}));
try {
  await mf.ready;
  // Miniflare's Node type replacement collapses this namespace to Request.
  // Keep the bridge limited to the two real methods exercised below.
  const namespace = await mf.getDurableObjectNamespace('HEALTH_MONITOR') as unknown as {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(url: string, init: { method: string }): Promise<{
      status: number; json(): Promise<unknown>;
    }> };
  };
  const monitor = namespace.get(namespace.idFromName('synthetic-monitor'));
  for (const status of [204, 302, 503]) {
    writerStatus = status;
    const before = reports.length;
    const response = await monitor.fetch('https://health.internal/check', { method: 'POST' });
    assert.equal(response.status, 200, 'History transport must not change monitor admission');
    const health = await response.json() as { healthy: boolean; issue: null };
    assert.equal(health.healthy, true);
    assert.equal(health.issue, null);
    await new Promise(resolve => { setTimeout(resolve, 2100); });
    assert.equal(reports.length, before + 1, 'Exactly one observation; no automatic retry');
    const observation = reports.at(-1) as Record<string, unknown>;
    assert.deepEqual(Object.keys(observation).sort(), ['family', 'id', 'observedAt', 'state']);
    assert.equal(observation.state, 'healthy');
    assert.equal(observation.family, null);
  }
  assert.deepEqual(forbidden, [], 'No redirect, alert or unmocked network request');
  console.log('Real workerd monitor reporting: success, redirect rejection and failure isolation passed.');
} finally { await mf.dispose(); }
