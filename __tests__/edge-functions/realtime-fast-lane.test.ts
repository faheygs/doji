import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('realtime command fast lane', () => {
  const worker = read('infra/doji-orchestrator/src/index.ts');
  const gateway = read('infra/doji-orchestrator/src/command-gateway.ts');
  const relay = read('supabase/functions/relay-domain-events/index.ts');
  const migration = read('supabase/migrations/20260823140000_realtime_delivery_slo.sql');
  const dueWakeMigration = read(
    'supabase/migrations/20260902210000_rearm_due_outbox_wake.sql',
  );

  it('preserves user JWT authorization and uses an explicit command allowlist', () => {
    expect(gateway).toContain('const AUTHENTICATED_COMMANDS = new Set');
    expect(gateway).toContain("authorization,");
    expect(gateway).toContain("apikey: env.SUPABASE_ANON_KEY");
    expect(gateway).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
  });

  it('wakes the coalescing durable relay only after a successful commit', () => {
    const success = gateway.indexOf('if (upstream.ok)');
    const durableWake = gateway.indexOf("idFromName('singleton')", success);
    expect(success).toBeGreaterThan(0);
    expect(durableWake).toBeGreaterThan(success);
    expect(gateway).toContain("fetch('https://alarm.internal/wake'");
    expect(gateway).toContain('database wake remains active');
  });

  it('directly wakes lifecycle events without waiting for pg_net', () => {
    expect(worker).toContain("await orchestrateDoji(this.env, 'prelive'");
    expect(worker).toContain('await wakeDomainRelayNow(this.env)');
    expect(worker).toContain('handleCommandGateway(request, env)');
  });

  it('does not block Ably publication on push-recipient hydration', () => {
    expect(relay).toContain('const profilesByIdPromise = (async () =>');
    expect(relay).toContain('const profileState = await profilesByIdPromise');
    const topicWorker = relay.indexOf('await runTopicWorkers([...byTopic.values()]');
    expect(relay.indexOf('await publishAblyEvents(', topicWorker)).toBeLessThan(
      relay.indexOf('await processEventSideEffects(event)', topicWorker),
    );
  });

  it('records and alerts on realtime publication latency independently of push', () => {
    expect(migration).toContain('realtime_published_at');
    expect(migration).toContain("'realtime_p95_ms_5m'");
    expect(migration).toContain("'realtime_over_5s_5m'");
    expect(migration).toContain('realtime.slow < 3');
  });

  it('immediately re-arms when delayed work crosses its availability boundary', () => {
    expect(dueWakeMigration).toContain('min(event.available_at) as next_at');
    expect(dueWakeMigration).toContain('event.published_at is null');
    expect(dueWakeMigration).toContain('greatest(clock_timestamp(), next_event.next_at)');
  });

  it('routes core interactive mutations through one client command helper', () => {
    for (const file of [
      'hooks/useToggleReaction.ts',
      'hooks/useAddComment.ts',
      'hooks/useCommentMutations.ts',
      'hooks/usePollVote.ts',
      'hooks/useUserEvent.ts',
    ]) {
      expect(read(file)).toContain('executeCommand(');
    }
  });
});
