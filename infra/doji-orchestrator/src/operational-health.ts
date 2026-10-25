import { fetchOperationalHealth, OperationalHealthCheckError, type OperationalEnv } from './operational-health-read';
export { fetchOperationalHealth, operationalHealthFailureDetails } from './operational-health-read';

export type OperationalHealth = {
  healthy?: boolean;
  alarm_repairs?: EventAlarmRepair[];
} & Record<string, unknown>;

export type OperationalIssue = {
  family: string;
  immediate: boolean;
  diagnostics: Record<string, unknown>;
};

export type EventAlarmRepair = {
  dailyEventId: string;
  firesAt: string;
  phase: 'prelive' | 'activate' | 'close';
  closesAt?: string | null;
  chainNext: boolean;
  closeAction: 'close' | 'close_targeted';
};

const ALERT_TIMEOUT_MS = 12_000;

async function operationalFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = ALERT_TIMEOUT_MS,
): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(timeoutMs),
  });
}


export async function sendOperationalAlert(
  env: OperationalEnv,
  issueFamily: string,
  details: Record<string, unknown>,
): Promise<void> {
  const alert = await operationalFetch(`${env.SUPABASE_URL}/functions/v1/send-admin-email`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-outbox-secret': env.OUTBOX_RELAY_SECRET,
    },
    body: JSON.stringify({
      event: 'operational_health',
      issue_family: issueFamily,
      source: 'doji-orchestrator',
      observed_at: new Date().toISOString(),
      ...details,
    }),
  });
  if (!alert.ok) throw new Error(`Operational alert delivery failed: ${alert.status}`);
}

export async function checkOperationalHealth(
  env: OperationalEnv,
  wakeDomainRelay: () => Promise<void>,
  repairEventAlarms: (repairs: EventAlarmRepair[]) => Promise<void>,
): Promise<OperationalHealth> {
  // Supabase Edge Functions may incur an isolated cold start. Retry one bounded
  // health read before treating the monitor itself as unavailable; durable Doji
  // alarms and outbox correctness never depend on this diagnostic request.
  const health = await fetchOperationalHealth(env) as OperationalHealth;
  if (Array.isArray(health.alarm_repairs) && health.alarm_repairs.length > 0) {
    try { await repairEventAlarms(health.alarm_repairs); }
    catch { throw new OperationalHealthCheckError('repair', 0, 'repair'); }
  }
  // Durable outbox rows survive an immediate worker failure. A health-driven
  // wake recovers overdue work when the worker becomes available again.
  if (Number(health.outbox_overdue ?? 0) > 0) {
    try {
      await wakeDomainRelay();
    } catch (error) {
      console.error('Unable to enqueue overdue outbox recovery wake', error);
    }
  }
  return health;
}

/**
 * Returns only conditions that should page a person. Repairable alarm drift and
 * in-flight push rows are owned by their Durable Objects and remain telemetry.
 */
export function actionableOperationalIssue(health: OperationalHealth): OperationalIssue | null {
  if (Number(health.apns_provider_credential_errors ?? 0) > 0) {
    return {
      family: 'apns-provider-credentials',
      immediate: true,
      diagnostics: { suspected_layer: 'apns-provider-credentials' },
    };
  }
  if (Number(health.outbox_exhausted ?? 0) > 0) {
    return {
      family: 'domain-outbox-exhausted',
      immediate: true,
      diagnostics: { suspected_layer: 'durable-outbox' },
    };
  }
  if (Number(health.push_exhausted_shards ?? 0) > 0) {
    return {
      family: 'push-fanout-exhausted',
      immediate: true,
      diagnostics: { suspected_layer: 'push-fanout' },
    };
  }
  if (Number(health.outbox_overdue ?? 0) > 0) {
    return {
      family: 'domain-outbox-delayed',
      immediate: false,
      diagnostics: { suspected_layer: 'durable-outbox' },
    };
  }
  if (
    Number(health.realtime_max_ms_5m ?? 0) > 30_000 ||
    (
      Number(health.realtime_sample_count_5m ?? 0) >= 20 &&
      Number(health.realtime_p95_ms_5m ?? 0) > 5_000
    )
  ) {
    const durableOutboxCaughtUp = Number(health.outbox_overdue ?? 0) === 0 &&
      Number(health.outbox_exhausted ?? 0) === 0;
    const realtimePublishRetried = Number(health.realtime_retried_samples_5m ?? 0) > 0 ||
      Number(health.realtime_max_publish_attempts_5m ?? 1) > 1;
    return {
      family: 'realtime-delivery-degraded',
      immediate: false,
      diagnostics: {
        suspected_layer: durableOutboxCaughtUp
          ? realtimePublishRetried
            ? 'publication-or-database-acknowledgement'
            : 'relay-or-publication-path'
          : 'durable-outbox',
        durable_outbox_caught_up: durableOutboxCaughtUp,
        realtime_publish_retried: realtimePublishRetried,
        database_writes_at_risk: false,
      },
    };
  }
  return null;
}
