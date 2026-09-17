import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('backend-only correctness and scale hardening', () => {
  const migration = read(
    'supabase/migrations/20260917120000_backend_correctness_and_release_observability.sql',
  );
  const gateway = read('infra/doji-orchestrator/src/command-gateway.ts');
  const relay = read('supabase/functions/relay-domain-events/index.ts');
  const realtimeLatency = read('supabase/functions/_shared/realtime-latency.ts');

  it('materializes and repairs expired lazy occurrences as missed', () => {
    expect(migration).toContain('initial_status := case');
    expect(migration).toContain("else 'missed'");
    expect(migration).toContain("occurrence.status = 'pending'");
    expect(migration).toContain("set status = 'missed'");
    expect(migration).toContain('when occurrence.signup_day_grace is true');
    expect(migration).toContain("when event_row.status = 'buy_in_open' then 'live'");
  });

  it('preserves old push registration while preparing release cohort telemetry', () => {
    expect(migration).toContain('register_native_push_endpoint_v3');
    expect(migration).toContain('perform public.register_native_push_endpoint_v2');
    expect(migration).toContain('get_mobile_release_observability');
    expect(migration).toContain(
      'grant execute on function public.get_mobile_release_observability() to service_role',
    );
    const client = read('lib/pushNotifications.ts');
    expect(client).toContain("executeCommand('register_native_push_endpoint_v3'");
    expect(gateway).toContain("releaseHeader(request, 'x-doji-app-version')");
    expect(gateway).toContain('...release');
  });

  it('removes the two production performance-advisor findings', () => {
    expect(migration).toContain('drop policy if exists posts_read_all_authenticated');
    expect(migration).toContain('drop index if exists public.weekly_xp_week_xp_user_idx');
  });

  it('reports command database and relay wake timing without logging request data', () => {
    expect(gateway).toContain("metric: 'command_gateway'");
    expect(gateway).toContain("headers.set('server-timing', serverTiming)");
    expect(gateway).toContain('upstreamDurationMs');
    expect(gateway).toContain('wakeDurationMs');
    expect(gateway).not.toContain('console.info(body)');
  });

  it('uses bounded parallel relay publication and percentile telemetry', () => {
    expect(relay).toContain('MAX_TOPIC_WORKERS = 16');
    expect(realtimeLatency).toContain('p50Ms: percentile(0.5)');
    expect(realtimeLatency).toContain('p95Ms: percentile(0.95)');
    expect(relay).toContain('Math.min(MAX_TOPIC_WORKERS, groups.length)');
  });
});
