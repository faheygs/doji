jest.mock('cloudflare:workers', () => ({ DurableObject: class {
  ctx: unknown;
  env: unknown;
  constructor(ctx: unknown, env: unknown) { this.ctx = ctx; this.env = env; }
} }), { virtual: true });
jest.mock('../../infra/doji-orchestrator/src/operational-health', () => ({
  checkOperationalHealth: jest.fn(), actionableOperationalIssue: jest.fn(),
  sendOperationalAlert: jest.fn().mockResolvedValue('accepted'), operationalHealthFailureDetails: () => ({}),
}));
jest.mock('../../infra/doji-orchestrator/src/sentry', () => ({ captureWorkerException: jest.fn().mockResolvedValue('accepted') }));
import { HealthMonitor } from '../../infra/doji-orchestrator/src/health-monitor';
import { checkOperationalHealth, actionableOperationalIssue, sendOperationalAlert } from '../../infra/doji-orchestrator/src/operational-health';
import type { Env } from '../../infra/doji-orchestrator/src/index';

test('actual monitor reports success, degradation and failed checks without changing alert thresholds or replaying writes', async () => {
  const original = global.fetch;
  const rows = new Map<string, unknown>(), pending: Promise<unknown>[] = [], payloads: unknown[] = [];
  const ctx = { storage: { get: async (key: string) => rows.get(key), put: async (key: string, value: unknown) => { rows.set(key, value); } },
    waitUntil: (promise: Promise<unknown>) => pending.push(promise) };
  const env = { MONITOR_HISTORY_ENABLED: 'true', DOJI_ENVIRONMENT: 'staging', SUPABASE_URL: 'https://ohrcupagdoilkwhecict.supabase.co', OUTBOX_RELAY_SECRET: 'synthetic' } as Env;
  const monitor = new HealthMonitor(ctx as unknown as ConstructorParameters<typeof HealthMonitor>[0], env);
  try {
    global.fetch = jest.fn(async (_url, init) => { payloads.push(JSON.parse(String(init?.body))); return new Response(null, { status: 503 }); });
    (checkOperationalHealth as jest.Mock).mockResolvedValue({ healthy: true });
    (actionableOperationalIssue as jest.Mock).mockReturnValue(null);
    expect((await monitor.fetch(new Request('https://local.test', { method: 'POST' }))).status).toBe(200);
    await Promise.all(pending.splice(0));
    expect(payloads[0]).toMatchObject({ state: 'healthy', family: null });
    expect(global.fetch).toHaveBeenCalledWith(
      'https://ohrcupagdoilkwhecict.supabase.co/functions/v1/operational-health/monitor-observation',
      expect.objectContaining({ redirect: 'manual' }),
    );
    (actionableOperationalIssue as jest.Mock).mockReturnValue({ family: 'domain-outbox-delayed', immediate: false, diagnostics: {} });
    expect((await monitor.fetch(new Request('https://local.test', { method: 'POST' }))).status).toBe(200);
    await Promise.all(pending.splice(0));
    expect(payloads[1]).toMatchObject({ state: 'degraded', family: 'domain-outbox-delayed' });
    (checkOperationalHealth as jest.Mock).mockRejectedValue(Error('private monitor transport error'));
    expect((await monitor.fetch(new Request('https://local.test', { method: 'POST' }))).status).toBe(503);
    await Promise.all(pending.splice(0));
    expect(payloads[2]).toMatchObject({ state: 'unavailable', family: 'operational-health-check-failed' });
    expect(payloads).toHaveLength(3);
    expect(sendOperationalAlert).not.toHaveBeenCalled();
    expect(JSON.stringify(payloads)).not.toMatch(/private|secret|diagnostics/);
    expect((rows.get('health') as { consecutiveCheckFailures: number }).consecutiveCheckFailures).toBe(1);
  } finally { global.fetch = original; }
});
