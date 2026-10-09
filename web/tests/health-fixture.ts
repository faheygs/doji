export function healthFixture(now = Date.now()) {
  const at = new Date(now).toISOString();
  return {
    generated_at: at,
    operational: {
      available: true,
      healthy: true,
      checked_at: at,
      realtime_p95_ms_5m: 180,
      realtime_max_ms_5m: 220,
      realtime_sample_count_5m: 66,
      realtime_over_5s_5m: 0,
      outbox_overdue: 0,
      outbox_exhausted: 0,
      push_stale_shards: 0,
      push_exhausted_shards: 0,
      apns_provider_credential_errors: 0,
    },
    sentry: {
      configured: true,
      available: true,
      observed_at: at,
      issues: [
        {
          id: '1234567',
          title: 'Synthetic foreground timeout',
          project: 'synthetic-app',
          status: 'unresolved',
          level: 'error',
          event_count: 4,
          affected_users: 2,
          first_seen: at,
          last_seen: at,
          permalink: 'https://doji-i0.sentry.io/issues/1234567/',
        },
      ],
    },
  };
}
export function historyFixture(now = Date.now()) {
  return {
    items: [
      {
        daily_event_id: '20000000-0000-4000-8000-000000000002',
        title: 'Synthetic Doji summary',
        fires_at: new Date(now - 7200000).toISOString(),
        closes_at: new Date(now - 6600000).toISOString(),
        observed_through: new Date(now - 3600000).toISOString(),
        finalized_at: new Date(now - 3500000).toISOString(),
        healthy: true,
        realtime_p95_ms: 620,
        realtime_max_ms: 800,
        realtime_sample_count: 64,
        realtime_over_5s: 0,
        outbox_unpublished: 0,
        outbox_exhausted: 0,
        push_shards_expired: 0,
        push_shards_exhausted: 0,
      },
    ],
  };
}
