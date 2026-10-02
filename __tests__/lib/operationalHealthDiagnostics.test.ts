import {
  actionableOperationalIssue,
  operationalHealthFailureDetails,
} from '../../infra/doji-orchestrator/src/operational-health';

describe('operational health diagnostics', () => {
  it.each([1, 2])('uses publication stage evidence rather than queue recovery alone (attempt %i)', attempts => {
    const issue = actionableOperationalIssue({
      outbox_exhausted: 0,
      outbox_overdue: 0,
      realtime_max_ms_5m: 84_264,
      realtime_p95_ms_5m: 30_207,
      realtime_sample_count_5m: 77,
      realtime_max_publish_attempts_5m: attempts,
    });

    expect(issue).toEqual({
      family: 'realtime-delivery-degraded',
      immediate: false,
      diagnostics: {
        suspected_layer: attempts > 1 ? 'publication-or-database-acknowledgement' : 'relay-or-publication-path',
        realtime_publish_retried: attempts > 1,
        durable_outbox_caught_up: true,
        database_writes_at_risk: false,
      },
    });
  });

  it('labels an aborted provider health request as a timeout without exposing a body', () => {
    const timeout = Object.assign(new Error('The operation was aborted due to timeout'), {
      name: 'TimeoutError',
    });

    expect(operationalHealthFailureDetails(timeout)).toEqual({
      provider: 'supabase',
      provider_surface: 'edge-functions',
      failure_kind: 'timeout',
      attempts: 2,
      upstream_status: null,
      durable_event_state: 'unverified-health-read',
    });
  });
});
