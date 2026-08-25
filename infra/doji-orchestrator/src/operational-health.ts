type OperationalEnv = {
  SUPABASE_URL: string;
  OUTBOX_RELAY_SECRET: string;
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
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`Operational health check failed: ${response.status} ${body}`);
      }
      return JSON.parse(body) as Record<string, unknown>;
    } catch (error) {
      lastError = error;
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
): Promise<void> {
  // Supabase Edge Functions may incur an isolated cold start. Retry one bounded
  // health read before treating the monitor itself as unavailable; durable Doji
  // alarms and outbox correctness never depend on this diagnostic request.
  const health = await fetchOperationalHealth(env) as {
    healthy?: boolean;
    alarm_repairs?: EventAlarmRepair[];
  } & Record<string, unknown>;
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
  if (health.healthy === true) return;
  console.error('Doji operational health is degraded', health);
  const credentialErrors = Number(health.apns_provider_credential_errors ?? 0);
  await sendOperationalAlert(
    env,
    credentialErrors > 0 ? 'apns-provider-credentials' : 'health-degraded',
    health,
  );
}
