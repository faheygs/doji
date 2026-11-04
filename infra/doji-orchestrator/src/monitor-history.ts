import { monitorProject, validMonitorObservation, type MonitorObservation } from '../../../supabase/functions/_shared/monitor-observation.ts';

export interface MonitorHistoryEnvironment {
  MONITOR_HISTORY_ENABLED?: string;
  DOJI_ENVIRONMENT?: string;
  SUPABASE_URL: string;
  OUTBOX_RELAY_SECRET: string;
}

/** One best-effort write. Never retries, alerts, repairs or alters monitor admission. */
export async function reportMonitorObservation(
  env: MonitorHistoryEnvironment,
  observation: MonitorObservation,
): Promise<boolean> {
  const project = monitorProject(env.DOJI_ENVIRONMENT);
  if (env.MONITOR_HISTORY_ENABLED !== 'true' || !project
    || env.SUPABASE_URL !== `https://${project}.supabase.co`
    || !env.OUTBOX_RELAY_SECRET || !validMonitorObservation(observation)) return false;
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve(false); }, 2000);
    });
    const send = Promise.resolve().then(async () => {
      const response = await fetch(`${env.SUPABASE_URL}/functions/v1/operational-health/monitor-observation`, {
        // workerd supports manual/follow, not error; only 204 below is accepted.
        method: 'POST', redirect: 'manual', signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-outbox-secret': env.OUTBOX_RELAY_SECRET },
        body: JSON.stringify(observation),
      });
      // 204 acknowledges the ledger transaction, not provider or phone delivery.
      void response.body?.cancel().catch(() => undefined);
      return !controller.signal.aborted && response.status === 204;
    }).catch(() => false);
    return await Promise.race([send, deadline]);
  } finally { clearTimeout(timer); controller.abort(); }
}
