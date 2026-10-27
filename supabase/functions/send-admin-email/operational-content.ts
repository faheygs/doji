import { humanizeEmailToken, type DojiEmailFact } from '../_shared/doji-email.ts';

function boundedString(value: unknown, max = 500): string {
  return String(value ?? '').trim().slice(0, max);
}

function formatMetric(value: unknown, suffix = ''): string | null {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${new Intl.NumberFormat('en-US').format(number)}${suffix}`;
}

export function operationalFacts(payload: Record<string, unknown>): DojiEmailFact[] {
  const definitions: Array<[string, string, string]> = [
    ['realtime_p95_ms_5m', 'Realtime p95 (5m)', ' ms'],
    ['realtime_max_ms_5m', 'Realtime max (5m)', ' ms'],
    ['realtime_sample_count_5m', 'Realtime samples (5m)', ''],
    ['realtime_over_5s_5m', 'Events over 5s (5m)', ''],
    ['realtime_retried_samples_5m', 'Realtime publish retries (5m)', ''],
    ['realtime_max_publish_attempts_5m', 'Max realtime publish attempts (5m)', ''],
    ['outbox_overdue', 'Overdue outbox rows', ''],
    ['outbox_exhausted', 'Exhausted outbox rows', ''],
    ['outbox_oldest_due_seconds', 'Oldest overdue work', ' sec'],
    ['push_stale_shards', 'Stale push shards', ''],
    ['push_exhausted_shards', 'Exhausted push shards', ''],
    ['apns_provider_credential_errors', 'APNs credential errors', ''],
    ['consecutive_unhealthy_checks', 'Consecutive unhealthy checks', ''],
    ['attempts', 'Health-read attempts', ''],
    ['upstream_status', 'Upstream HTTP status', ''],
  ];
  const facts: DojiEmailFact[] = [];
  for (const [key, label, suffix] of definitions) {
    if (payload[key] === null || payload[key] === undefined) continue;
    const value = formatMetric(payload[key], suffix);
    if (value !== null) facts.push({ label, value });
  }
  for (const [key, label] of [
    ['suspected_layer', 'Suspected layer'],
    ['failure_kind', 'Failure class'],
    ['durable_event_state', 'Durable event state'],
  ] as const) {
    const value = boundedString(payload[key], 120);
    if (value) facts.push({ label, value: humanizeEmailToken(value) });
  }
  if (typeof payload.database_writes_at_risk === 'boolean') {
    facts.push({
      label: 'Committed writes at risk',
      value: payload.database_writes_at_risk ? 'Yes' : 'No',
    });
  }
  return facts;
}

export function operationalGuidance(
  issueFamily: string,
  payload: Record<string, unknown>,
  environment: 'production' | 'staging',
): { meaning: string; steps: string[] } {
  if (issueFamily === 'realtime-delivery-degraded') {
    const suspectedLayer = String(payload.suspected_layer ?? '');
    const relayPickupDelayed =
      suspectedLayer === 'relay-wake-or-supabase-edge' ||
      suspectedLayer === 'relay-or-publication-path';
    return {
      meaning:
        'Committed data is still authoritative in Postgres, but live updates are arriving slower than the delivery objective.',
      steps: relayPickupDelayed
        ? [
            'Open Platform operations and compare realtime latency with durable outbox health.',
            'Review orchestrator relay timing, database waits/timeouts, and Supabase Edge Function availability for the same observation window.',
            'Compare wake, claim, provider publication, and database acknowledgement timing; a first attempt does not isolate the slow stage.',
          ]
        : [
            'Open Platform operations and compare realtime latency with durable outbox health.',
            'Compare Sentry and database timeout logs with relay/provider errors for the same observation window.',
            'Retries can follow provider failure or a failed database acknowledgement after successful publication. A recovered queue does not identify the cause.',
          ],
    };
  }
  if (issueFamily === 'domain-outbox-delayed' || issueFamily === 'domain-outbox-exhausted') {
    return {
      meaning:
        'Durable domain-event work is delayed or exhausted. The underlying application writes remain committed, but realtime and notification delivery need attention.',
      steps: [
        'Open Platform operations and inspect overdue and exhausted outbox counts.',
        'Review the relay and orchestration Sentry groups for the matching time window.',
        'Confirm the protected relay wake and provider credentials are healthy before attempting manual intervention.',
      ],
    };
  }
  if (issueFamily.includes('push') || issueFamily.includes('apns')) {
    return {
      meaning:
        'Native notification delivery is degraded. In-app state remains authoritative and will reconcile when members open or foreground Doji.',
      steps: [
        'Open Platform operations and inspect the affected provider and shard telemetry.',
        'Check recent credential/provider failures in Sentry without rotating credentials blindly.',
        `Verify the exact ${environment} release provider configuration before retrying any delivery workflow.`,
      ],
    };
  }
  return {
    meaning: `The protected ${environment} monitor detected a condition that needs an administrator review.`,
    steps: [
      'Open Platform operations and review the authoritative health snapshot.',
      'Correlate the observation time with the newest Sentry issue groups.',
      'Record any intervention in the operational audit trail.',
    ],
  };
}
