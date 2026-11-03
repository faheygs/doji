import { readEmployeeSentry } from './employee-sentry.mts';
import { createEmployeeHealthSummary } from './employee-health-summary.mts';
import { record } from './portal-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';
import type { EmployeeApplication, EmployeeActor } from './employee-contracts.mts';
import { healthVersions } from './employee-health-contracts.mts';
export interface EmployeeMonitoringConfig {
  token?: string;
  organization?: string;
  projectIds?: string[];
  projectSlugs?: string[];
  environment?: 'production' | 'staging';
}
interface HealthCache {
  until: number;
  version: string;
  promise: Promise<Record<string, unknown>>;
}
// Same bounded monitoring contract as the existing portal: no new polling,
// aggregate health only, at most 25 unresolved issues over the past 24 hours.
export function createEmployeeHealth<Actor = EmployeeActor>(
  application: EmployeeApplication<Actor>,
  {
    token,
    organization,
    projectIds = [],
    projectSlugs = [],
    environment = 'production',
  }: EmployeeMonitoringConfig = {},
  {
    upstream = fetch,
    now = Date.now,
    healthEventsEnabled = false,
    workflowHealthEnabled = false,
    healthSnapshotEnabled = false,
  }: {
    upstream?: PortalFetch;
    now?: () => number;
    healthEventsEnabled?: boolean;
    workflowHealthEnabled?: boolean;
    healthSnapshotEnabled?: boolean;
  } = {},
) {
  if (environment !== 'production' && environment !== 'staging')
    throw Error('Invalid monitoring environment');
  if (healthSnapshotEnabled && healthEventsEnabled) throw Error('Conflicting health modes');
  const snapshot = createEmployeeHealthSummary(application, healthSnapshotEnabled, false);
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
    sentryCache: HealthCache | null = null,
    workflowCache: HealthCache | null = null;
  function cached(
    kind: 'operations' | 'sentry' | 'workflows',
    ttl: number,
    version: string,
    load: () => Promise<Record<string, unknown>>,
  ) {
    const existing =
      kind === 'operations' ? operationsCache : kind === 'sentry' ? sentryCache : workflowCache;
    if (existing && existing.until > now() && existing.version === version) return existing.promise;
    const promise = Promise.resolve()
      .then(load)
      .then((value) => {
        if (kind === 'sentry') {
          // A failed attempt is not a successful observation. Brief backoff
          // prevents retry storms without hiding recovery for a full minute.
          if (value.available !== true)
            cell.until =
              now() + ([401, 403, 429].includes(Number(value.upstream_status)) ? 60000 : 10000);
          return value;
        }
        return { ...value, observed_at: new Date(now()).toISOString() };
      });
    const cell = { until: now() + ttl, promise, version };
    if (kind === 'operations') operationsCache = cell;
    else if (kind === 'sentry') sentryCache = cell;
    else workflowCache = cell;
    return promise;
  }
  async function sentry() {
    if (!configured) return { configured: false, available: false, issues: [] };
    return readEmployeeSentry(
      { token, organization, projectIds, projectSlugs, environment },
      upstream,
      now,
    );
  }
  return async (actor: Actor, signal: AbortSignal) => {
    if (healthSnapshotEnabled) {
      const stored = await snapshot(actor, signal);
      const issues =
        stored.enabled === true
          ? await cached('sentry', 60000, 'snapshot', sentry)
          : { configured, available: false, issues: [] };
      const current = await application.authorize(actor, signal);
      signal.throwIfAborted();
      if (
        !record(current) ||
        !record(current.capabilities) ||
        current.capabilities.operations_read !== true
      )
        throw Object.assign(Error('Operations access required'), { status: 403 });
      return {
        generated_at: new Date(now()).toISOString(),
        health_events_enabled: false,
        health_snapshot_enabled: stored.enabled === true,
        operational:
          stored.available === true && record(stored.operational)
            ? stored.operational
            : { available: false },
        workflows:
          stored.available === true && record(stored.workflows)
            ? stored.workflows
            : { available: false },
        sentry: issues,
      };
    }
    // Authorization precedes every cache hit. Cache is not authority.
    const operator = await application.authorize(actor, signal);
    if (
      !record(operator) ||
      !record(operator.capabilities) ||
      operator.capabilities.operations_read !== true
    )
      throw Object.assign(Error('Operations access required'), { status: 403 });
    signal.throwIfAborted();
    // Read the authoritative revision before cache lookup. Browser hints never
    // supply cache keys or force arbitrary cache eviction.
    for (let attempt = 0; attempt < 2; attempt++) {
      const versions = healthEventsEnabled
        ? healthVersions(
            await application.command(
              actor,
              { name: 'get_admin_health_feed_v1', args: {} },
              signal,
            ),
          )
        : { delivery: 'legacy', history: 'legacy', sentry: 'legacy' };
      signal.throwIfAborted();
      const results = await Promise.allSettled([
        cached('operations', 30000, versions.delivery, async () => {
          const value = await application.command(
            actor,
            { name: 'get_admin_operational_health_read_v1', args: {} },
            AbortSignal.timeout(5000),
          );
          if (!record(value)) throw Error('Invalid operational snapshot');
          return value;
        }),
        cached('sentry', 60000, versions.sentry, sentry),
        workflowHealthEnabled
          ? cached('workflows', 30000, 'v1', async () => {
              const value = await application.command(
                actor,
                { name: 'get_admin_workflow_health_v1', args: {} },
                AbortSignal.timeout(5000),
              );
              if (!record(value)) throw Error('Invalid workflow snapshot');
              return { ...value, available: true };
            })
          : Promise.resolve({ available: false }),
      ]);
      signal.throwIfAborted();
      if (healthEventsEnabled) {
        const latest = healthVersions(
          await application.command(actor, { name: 'get_admin_health_feed_v1', args: {} }, signal),
        );
        signal.throwIfAborted();
        if (JSON.stringify(latest) !== JSON.stringify(versions)) continue;
      }
      return {
        generated_at: new Date(now()).toISOString(),
        health_events_enabled: healthEventsEnabled,
        workflows: results[2].status === 'fulfilled' ? results[2].value : { available: false },
        ...(healthEventsEnabled ? { source_revisions: versions } : {}),
        operational:
          results[0].status === 'fulfilled'
            ? { ...results[0].value, available: true }
            : { available: false, healthy: false },
        sentry:
          results[1].status === 'fulfilled'
            ? results[1].value
            : { configured, available: false, issues: [] },
      };
    }
    throw Object.assign(Error('Health readings changed during reconciliation'), { status: 503 });
  };
}
