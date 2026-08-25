import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('operational alerting contract', () => {
  it('emails degraded health and final queue retries through the protected relay path', () => {
    const worker = read('infra/doji-orchestrator/src/index.ts');
    expect(worker).toContain("event: 'operational_health'");
    expect(worker).toContain("'x-outbox-secret': env.OUTBOX_RELAY_SECRET");
    expect(worker).toContain("'push-fanout-final-retry'");
    expect(worker).toContain("'domain-relay-final-retry'");
    expect(worker).toContain("captureWorkerException(env.SENTRY_DSN, 'push_fanout_final_retry'");
    expect(worker).toContain("captureWorkerException(env.SENTRY_DSN, 'domain_relay_final_retry'");
    expect(worker).toContain('Number(health.outbox_overdue ?? 0) > 0');
    expect(worker).toContain('await wakeDomainRelayNow(env)');
    expect(worker).not.toContain('OPS_ALERT_WEBHOOK_URL');
  });

  it('keeps server diagnostics non-blocking and free of provider secrets', () => {
    const telemetry = read('infra/doji-orchestrator/src/sentry.ts');
    expect(telemetry).toContain("'application/x-sentry-envelope'");
    expect(telemetry).toContain("runtime: 'cloudflare-worker'");
    expect(telemetry).not.toContain('OUTBOX_RELAY_SECRET');
    expect(telemetry).not.toContain('ORCHESTRATOR_SECRET');
  });

  it('authenticates and deduplicates operational email delivery', () => {
    const email = read('supabase/functions/send-admin-email/index.ts');
    const migration = read('supabase/migrations/20260821123000_operational_alert_delivery.sql');
    const cooldown = read(
      'supabase/migrations/20260824230000_realtime_auth_and_alert_cooldown.sql',
    );
    expect(email).toContain("event === 'operational_health'");
    expect(email).toContain("req.headers.get('x-outbox-secret')");
    expect(email).toContain(".from('operational_alert_deliveries')");
    expect(email).toContain("'claim_operational_alert_delivery'");
    expect(migration).toContain('create table if not exists public.operational_alert_deliveries');
    expect(migration).toContain('revoke all on table public.operational_alert_deliveries');
    expect(cooldown).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(cooldown).toContain("clock_timestamp() - interval '60 minutes'");
  });
});
