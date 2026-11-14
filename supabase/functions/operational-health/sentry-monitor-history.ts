import { assertStagingSentryMonitor, sentryMonitorObservations, stagingSentryChecksUrl, stagingSentryMonitorUrl } from '../_shared/sentry-monitor-contract.ts';

type Config = { enabled?: string; historyEnabled?: string; environment?: string; supabaseUrl?: string; token?: string };
type RecordObservation = (args: Record<string, unknown>, signal: AbortSignal) => PromiseLike<{ error?: unknown }>;
type Outcome = 'disabled' | 'processed' | 'unavailable';

async function readChecks(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw Error('No body');
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    let text = '', bytes = 0;
    const decoder = new TextDecoder();
    while (!signal.aborted) {
      const part = await reader.read();
      if (signal.aborted) break;
      if (part.done) return JSON.parse(text + decoder.decode());
      bytes += part.value.byteLength;
      if (bytes > 16384) throw Error('Oversize checks');
      text += decoder.decode(part.value, { stream: true });
    }
    throw Error('Read expired');
  } finally { signal.removeEventListener('abort', cancel); cancel(); }
}

/** Existing collector only: bounded import, no probes, alert sends, repairs or retries. */
export async function captureSentryMonitorHistory(
  config: Config, record: RecordObservation, upstream: typeof fetch = fetch, now = Date.now,
): Promise<Outcome> {
  if (config.enabled !== 'true') return 'disabled';
  if (config.historyEnabled !== 'true' || config.environment !== 'staging'
    || config.supabaseUrl !== 'https://ohrcupagdoilkwhecict.supabase.co' || !config.token) return 'unavailable';
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = async (url: string): Promise<unknown> => {
    const response = await upstream(url, {
      method: 'GET', headers: { authorization: `Bearer ${config.token}` },
      redirect: 'error', signal: controller.signal,
    });
    if (controller.signal.aborted || response.status !== 200) {
      void response.body?.cancel().catch(() => undefined); throw Error('Provider read unavailable');
    }
    return readChecks(response, controller.signal);
  };
  const operation = async (): Promise<Outcome> => {
    const monitor = await read(stagingSentryMonitorUrl);
    assertStagingSentryMonitor(monitor);
    if (controller.signal.aborted) return 'unavailable';
    const observations = sentryMonitorObservations(await read(stagingSentryChecksUrl), now(), monitor);
    for (const observation of observations) {
      if (controller.signal.aborted) return 'unavailable';
      const result = await record({ p_monitor: 'watchdog', p_observation_id: observation.id,
        p_observed_at: observation.observedAt, p_state: observation.state, p_family: observation.family,
      }, controller.signal);
      if (controller.signal.aborted || result.error) return 'unavailable';
    }
    return 'processed';
  };
  try {
    return await Promise.race([
      operation().catch(() => 'unavailable' as const),
      new Promise<Outcome>(resolve => { timer = setTimeout(() => {
        controller.abort(); resolve('unavailable');
      }, 2000); }),
    ]);
  } finally { clearTimeout(timer); controller.abort(); }
}
