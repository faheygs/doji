// A one-shot probe for a separately approved independent runner; never schedules or sends alerts.
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { monitorProject } from '../supabase/functions/_shared/monitor-observation.ts';
import { assessMonitorHeartbeat } from '../supabase/functions/_shared/monitor-heartbeat.ts';
export { assessMonitorHeartbeat };

type Check = { ok: boolean; reason: string };

export async function checkMonitor(
  environment: string, secret: string, upstream: typeof fetch = fetch,
  now: () => number = Date.now,
): Promise<Check> {
  const project = monitorProject(environment);
  if (!project || !secret || /[\r\n]/.test(secret)) return { ok: false, reason: 'invalid_configuration' };
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const deadline = new Promise<Check>((resolve) => {
      timer = setTimeout(() => { controller.abort(); resolve({ ok: false, reason: 'probe_timeout' }); }, 5000);
    });
    const probe = async (): Promise<Check> => {
      const response = await upstream(`https://${project}.supabase.co/functions/v1/operational-health/monitor-check`, {
        redirect: 'error', signal: controller.signal,
        headers: { 'x-monitor-check-secret': secret, 'cache-control': 'no-cache' },
      });
      if (!response.ok) { void response.body?.cancel().catch(() => undefined); return { ok: false, reason: 'probe_http_failure' }; }
      const reader = response.body?.getReader();
      if (!reader) return { ok: false, reason: 'invalid_response' };
      const cancel = () => { void reader.cancel().catch(() => undefined); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      try {
        let text = '', bytes = 0;
        const decoder = new TextDecoder();
        while (!controller.signal.aborted) {
          const chunk = await reader.read();
          if (chunk.done) return assessMonitorHeartbeat(JSON.parse(text + decoder.decode()), environment, now());
          bytes += chunk.value.byteLength;
          if (bytes > 4096) return { ok: false, reason: 'invalid_response' };
          text += decoder.decode(chunk.value, { stream: true });
        }
        return { ok: false, reason: 'probe_timeout' };
      } finally { controller.signal.removeEventListener('abort', cancel); cancel(); }
    };
    return await Promise.race([probe().catch(() => ({ ok: false, reason: 'probe_unavailable' })), deadline]);
  } finally { clearTimeout(timer); controller.abort(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || process.argv[2] !== '--run') {
    console.error('Explicit --run plus DOJI_MONITOR_ENVIRONMENT/MONITOR_CHECK_SECRET required. No scheduling or alerts.');
    process.exitCode = 2;
  } else {
    const result = await checkMonitor(process.env.DOJI_MONITOR_ENVIRONMENT ?? '', process.env.MONITOR_CHECK_SECRET ?? '');
    console.log(JSON.stringify(result));
    process.exitCode = result.ok ? 0 : 1;
  }
}
