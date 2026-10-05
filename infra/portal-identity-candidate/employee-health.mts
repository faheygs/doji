import { boundedBody } from './bounded-body.mts';
import { record } from './portal-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
import type { EmployeeApplication, EmployeeActor } from './employee-contracts.mts';
export interface EmployeeMonitoringConfig {
  token?: string;
  organization?: string;
  projectIds?: string[];
  projectSlugs?: string[];
}
interface HealthCache {
  until: number;
  promise: Promise<Record<string, unknown>>;
}
// Same bounded monitoring contract as the existing portal: no new polling,
// aggregate health only, at most 25 unresolved issues over the past 24 hours.
export function createEmployeeHealth(
  application: EmployeeApplication,
  { token, organization, projectIds = [], projectSlugs = [] }: EmployeeMonitoringConfig = {},
  { upstream = fetch, now = Date.now }: { upstream?: PortalFetch; now?: () => number } = {},
) {
  const configured =
    typeof token === 'string' && token.length > 0 && /^[a-z0-9-]{1,100}$/.test(organization || '');
  if (projectIds.some((id) => !/^\d+$/.test(id)) || projectIds.length > 5)
    throw Error('Invalid monitoring projects');
  if (
    !Array.isArray(projectSlugs) ||
    projectSlugs.length > 5 ||
    projectSlugs.some((slug) => typeof slug !== 'string' || !/^[a-z0-9_-]{1,100}$/.test(slug))
  )
    throw Error('Invalid monitoring projects');
  let operationsCache: HealthCache | null = null,
    sentryCache: HealthCache | null = null;
  function cached(
    kind: 'operations' | 'sentry',
    ttl: number,
    load: () => Promise<Record<string, unknown>>,
  ) {
    const existing = kind === 'operations' ? operationsCache : sentryCache;
    if (existing && existing.until > now()) return existing.promise;
    const promise = Promise.resolve().then(load);
    const cell = { until: now() + ttl, promise };
    if (kind === 'operations') operationsCache = cell;
    else sentryCache = cell;
    return promise;
  }
  async function sentry() {
    if (!configured) return { configured: false, available: false, issues: [] };
    const query = new URLSearchParams({
      environment: 'production',
      statsPeriod: '24h',
      sort: 'date',
      limit: '25',
      query: 'is:unresolved' + projectSlugs.map((slug) => ` project:${slug}`).join(''),
    });
    for (const id of projectIds) query.append('project', id);
    const signal = AbortSignal.timeout(5000);
    const response = await upstream(
      `https://sentry.io/api/0/organizations/${organization}/issues/?${query}`,
      { headers: { authorization: `Bearer ${token}` }, redirect: 'error', signal },
    );
    if (!response.ok)
      return { configured: true, available: false, issues: [], upstream_status: response.status };
    const data: unknown = JSON.parse(
      new TextDecoder().decode(await boundedBody(response.body, signal, 262144)),
    );
    if (!Array.isArray(data) || data.length > 25) throw Error('Invalid monitoring response');
    const text = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : null);
    const count = (v: unknown) =>
      Number.isSafeInteger(Number(v)) && Number(v) >= 0 ? Number(v) : null;
    return {
      configured: true,
      available: true,
      window: '24h',
      unresolved_count: data.length,
      issues: data.map((value: unknown) => {
        if (!record(value)) throw Error('Invalid monitoring issue');
        const issue = value,
          metadata = record(issue.metadata) ? issue.metadata : {},
          project = record(issue.project) ? issue.project : {};
        return {
          id: text(issue.id, 80),
          short_id: text(issue.shortId, 80),
          title:
            text(issue.title ?? metadata.title ?? metadata.value) ?? 'Unhandled production issue',
          culprit: text(issue.culprit),
          level: text(issue.level, 30) ?? 'error',
          event_count: count(issue.count),
          affected_users: count(issue.userCount),
          first_seen: text(issue.firstSeen, 50),
          last_seen: text(issue.lastSeen, 50),
          status: text(issue.status, 30) ?? 'unresolved',
          project: text(project.slug ?? project.name, 100),
          permalink:
            typeof issue.permalink === 'string' &&
            /^https:\/\/(?:[a-z0-9-]+\.)*sentry\.io\//i.test(issue.permalink)
              ? issue.permalink
              : null,
        };
      }),
    };
  }
  return async (actor: EmployeeActor, signal: AbortSignal) => {
    // Authorization precedes every cache hit. Cache is not authority.
    const operator = await application.authorize(actor, signal);
    if (
      !record(operator) ||
      !record(operator.capabilities) ||
      operator.capabilities.operations_read !== true
    )
      throw Object.assign(Error('Operations access required'), { status: 403 });
    signal.throwIfAborted();
    const results = await Promise.allSettled([
      cached('operations', 30000, async () => {
        const value = await application.command(
          actor,
          { name: 'get_admin_operational_health_read_v1', args: {} },
          AbortSignal.timeout(5000),
        );
        if (!record(value)) throw Error('Invalid operational snapshot');
        return value;
      }),
      cached('sentry', 60000, sentry),
    ]);
    signal.throwIfAborted();
    return {
      generated_at: new Date(now()).toISOString(),
      operational:
        results[0].status === 'fulfilled'
          ? { ...results[0].value, available: true }
          : { available: false, healthy: false },
      sentry:
        results[1].status === 'fulfilled'
          ? results[1].value
          : { configured, available: false, issues: [] },
    };
  };
}
