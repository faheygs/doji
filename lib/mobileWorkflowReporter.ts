import type { WorkflowBatch, WorkflowCount } from '../contracts/mobileWorkflowTelemetry';
import { validWorkflowBatch } from '../contracts/mobileWorkflowTelemetry';

type Context = { session: string; token: string; platform: 'ios' | 'android' };
type Dependencies = {
  enabled: boolean;
  environment: string;
  url: string;
  current(): Context | null;
  take(): WorkflowCount[];
  id(): string;
  now(): number;
  fetch: typeof fetch;
};
/** Foreground-triggered only. No timer, background task, automatic retry or durable queue. */
export function createMobileWorkflowReporter(deps: Dependencies) {
  let attemptedAt = -Infinity;
  let controller: AbortController | undefined;
  let disposed = false;
  const expected =
    deps.environment === 'staging'
      ? 'https://ohrcupagdoilkwhecict.supabase.co'
      : deps.environment === 'production'
        ? 'https://tvixsmqxotuvyjqzmjla.supabase.co'
        : null;
  return {
    async foreground(): Promise<void> {
      if (disposed || controller || !deps.enabled || !expected || deps.url !== expected) return;
      const captured = deps.current(),
        now = deps.now();
      if (!captured || !Number.isSafeInteger(now) || now < attemptedAt + 900000) return;
      const rows = deps.take();
      if (!rows.length) return;
      const batch: WorkflowBatch = {
        id: deps.id(),
        issuedAt: now,
        platform: captured.platform,
        rows,
      };
      if (!validWorkflowBatch(batch, now) || deps.current()?.session !== captured.session) return;
      attemptedAt = now;
      const active = new AbortController();
      controller = active;
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.resolve()
            .then(async () => {
              if (disposed || deps.current()?.session !== captured.session) return;
              const response = await deps.fetch(`${expected}/functions/v1/mobile-workflow-report`, {
                method: 'POST',
                redirect: 'error',
                signal: active.signal,
                headers: {
                  authorization: `Bearer ${captured.token}`,
                  'content-type': 'application/json',
                },
                body: JSON.stringify(batch),
              });
              // No response body or raw failure enters diagnostics; receipt never affects member UI.
              void response.body?.cancel().catch(() => undefined);
            })
            .catch(() => undefined),
          new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              active.abort();
              resolve();
            }, 2000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        active.abort();
        if (controller === active) controller = undefined;
      }
    },
    dispose() {
      disposed = true;
      controller?.abort();
    },
  };
}
