import { boundedBody } from './bounded-body.mts';
import { record } from './portal-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
import type { EmployeeMonitoringConfig } from './employee-health.mts';

// Fits inside the existing 15-second portal request budget; no provider retries.
export const sentryReadDeadlineMs = 10000;

export async function readEmployeeSentry(
  config: EmployeeMonitoringConfig,
  upstream: PortalFetch,
  now: () => number,
): Promise<Record<string, unknown>> {
  const started = now();
  const controller = new AbortController();
  let phase: 'headers' | 'body' | 'response' = 'headers';
  let status: number | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unavailable = (failure: string) => ({
    configured: true,
    available: false,
    issues: [],
    failure,
    phase,
    ...(status === undefined ? {} : { upstream_status: status }),
    attempted_at: new Date(now()).toISOString(),
    elapsed_ms: Math.max(0, now() - started),
  });
  const deadline = new Promise<Record<string, unknown>>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve(unavailable('timeout'));
    }, sentryReadDeadlineMs);
  });
  const load = async (): Promise<Record<string, unknown>> => {
    try {
      const environment = config.environment ?? 'production';
      const query = new URLSearchParams({
        environment,
        statsPeriod: '24h',
        sort: 'date',
        limit: '25',
        query:
          'is:unresolved' + (config.projectSlugs ?? []).map((slug) => ` project:${slug}`).join(''),
      });
      for (const id of config.projectIds ?? []) query.append('project', id);
      const response = await upstream(
        `https://sentry.io/api/0/organizations/${config.organization}/issues/?${query}`,
        {
          headers: { authorization: `Bearer ${config.token}` },
          redirect: 'error',
          signal: controller.signal,
        },
      );
      status = response.status;
      if (controller.signal.aborted || !response.ok) {
        void response.body?.cancel().catch(() => {});
        return unavailable(controller.signal.aborted ? 'timeout' : 'http');
      }
      phase = 'body';
      const body = await boundedBody(response.body, controller.signal, 262144);
      phase = 'response';
      const data: unknown = JSON.parse(new TextDecoder().decode(body));
      if (!Array.isArray(data) || data.length > 25) throw Error('Invalid monitoring response');
      const text = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : null);
      const count = (v: unknown) =>
        Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null;
      return {
        configured: true,
        available: true,
        window: '24h',
        unresolved_count: data.length,
        observed_at: new Date(now()).toISOString(),
        attempted_at: new Date(now()).toISOString(),
        elapsed_ms: Math.max(0, now() - started),
        issues: data.map((value: unknown) => {
          if (!record(value)) throw Error('Invalid monitoring issue');
          const metadata = record(value.metadata) ? value.metadata : {};
          const project = record(value.project) ? value.project : {};
          return {
            id: text(value.id, 80),
            short_id: text(value.shortId, 80),
            title:
              text(value.title ?? metadata.title ?? metadata.value) ??
              `Unhandled ${environment} issue`,
            culprit: text(value.culprit),
            level: text(value.level, 30) ?? 'error',
            event_count: count(value.count),
            affected_users: count(value.userCount),
            first_seen: text(value.firstSeen, 50),
            last_seen: text(value.lastSeen, 50),
            status: text(value.status, 30) ?? 'unresolved',
            project: text(project.slug ?? project.name, 100),
            permalink:
              typeof value.permalink === 'string' &&
              /^https:\/\/(?:[a-z0-9-]+\.)*sentry\.io\//i.test(value.permalink)
                ? value.permalink
                : null,
          };
        }),
      };
    } catch {
      return unavailable(
        controller.signal.aborted
          ? 'timeout'
          : phase === 'headers'
            ? 'network'
            : 'invalid_response',
      );
    }
  };
  try {
    // Also bounds an injected/stalled transport that does not honor AbortSignal.
    return await Promise.race([load(), deadline]);
  } finally {
    clearTimeout(timer);
  }
}
