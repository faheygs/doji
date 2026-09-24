type OperationalEnv = {
  SUPABASE_URL: string;
  OUTBOX_RELAY_SECRET: string;
};

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
const HEALTH_TIMEOUT_MS = 20_000;
const HEALTH_ATTEMPTS = 2;
const HEALTH_RETRY_DELAY_MS = 750;

type HealthFailureKind = 'http' | 'invalid-response' | 'network' | 'timeout';

class OperationalHealthCheckError extends Error {
  constructor(
    message: string,
    readonly failureKind: HealthFailureKind,
    readonly attempts: number,
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'OperationalHealthCheckError';
  }
}

function timeoutFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const value = error as { message?: unknown; name?: unknown };
  return value.name === 'AbortError' || value.name === 'TimeoutError' ||
    (typeof value.message === 'string' && /aborted.*timeout|timed out/i.test(value.message));
}

function normalizeHealthFailure(error: unknown, attempt: number): OperationalHealthCheckError {
  if (error instanceof OperationalHealthCheckError) return error;
  if (timeoutFailure(error)) {
    return new OperationalHealthCheckError(
      'Supabase operational-health request timed out',
      'timeout',
      attempt,
    );
  }
  return new OperationalHealthCheckError(
    'Supabase operational-health request failed before a response',
    'network',
    attempt,
  );
}

export function operationalHealthFailureDetails(error: unknown): Record<string, unknown> {
  const failure = error instanceof OperationalHealthCheckError
    ? error
    : normalizeHealthFailure(error, HEALTH_ATTEMPTS);
  return {
    provider: 'supabase',
    provider_surface: 'edge-functions',
    failure_kind: failure.failureKind,
    attempts: failure.attempts,
    upstream_status: failure.status,
    durable_event_state: 'unverified-health-read',
  };
}

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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchOperationalHealth(env: OperationalEnv): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= HEALTH_ATTEMPTS; attempt += 1) {
    try {
      const response = await operationalFetch(
        `${env.SUPABASE_URL}/functions/v1/operational-health`,
        {
          method: 'POST',
          headers: { 'x-outbox-secret': env.OUTBOX_RELAY_SECRET },
        },
        HEALTH_TIMEOUT_MS,
      );
      if (!response.ok) {
        throw new OperationalHealthCheckError(
          `Supabase operational-health endpoint returned ${response.status}`,
          'http',
          attempt,
          response.status,
        );
      }
      try {
        return JSON.parse(await response.text()) as Record<string, unknown>;
      } catch {
        throw new OperationalHealthCheckError(
          'Supabase operational-health endpoint returned invalid JSON',
          'invalid-response',
          attempt,
          response.status,
        );
      }
    } catch (error) {
      lastError = normalizeHealthFailure(error, attempt);
      if (attempt < HEALTH_ATTEMPTS) await wait(HEALTH_RETRY_DELAY_MS);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
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
    await repairEventAlarms(health.alarm_repairs);
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
    return {
      family: 'realtime-delivery-degraded',
      immediate: false,
      diagnostics: {
        suspected_layer: durableOutboxCaughtUp
          ? 'realtime-provider-or-network'
          : 'durable-outbox',
        durable_outbox_caught_up: durableOutboxCaughtUp,
        database_writes_at_risk: false,
      },
    };
  }
  return null;
}
