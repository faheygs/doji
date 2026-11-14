import type { EmployeeApplication, EmployeeActor } from './employee-contracts.mts';
import { record } from './portal-contracts.mts';
import { mobileWorkflowRead } from './mobile-workflow-read.mts';
import type { MobileWorkflowRow } from './mobile-workflow-read.mts';

/** Hourly aggregation is server-only; the browser receives no raw buckets or admission data. */
export function projectMobileWorkflowHours(value: unknown) {
  const invalid = () => mobileWorkflowRead(null);
  if (!record(value) || value.source !== 'device_reported') return invalid();
  if (value.enabled === false) return mobileWorkflowRead(value);
  const header = { source: value.source, enabled: value.enabled, checked_at: value.checked_at };
  const empty = mobileWorkflowRead({ ...header, rows: [] });
  if (empty.status !== 'ready' || !Array.isArray(value.rows) || value.rows.length > 1440)
    return invalid();
  const groups = new Map<string, MobileWorkflowRow>();
  const seen = new Set<string>();
  for (const raw of value.rows) {
    const row = mobileWorkflowRead({ ...header, rows: [raw] }).rows[0];
    if (
      !row ||
      !record(raw) ||
      row.count > 1000000000 ||
      typeof raw.hour !== 'string' ||
      raw.hour.length > 40
    )
      return invalid();
    const hour = Date.parse(raw.hour),
      received = Date.parse(row.received_at);
    if (
      !Number.isFinite(hour) ||
      hour % 3600000 !== 0 ||
      received < hour ||
      received >= hour + 3600000
    )
      return invalid();
    const key = `${row.platform}:${row.phase}:${row.outcome}`,
      unique = `${key}:${hour}`;
    if (seen.has(unique)) return invalid();
    seen.add(unique);
    const previous = groups.get(key);
    groups.set(key, {
      ...row,
      count: row.count + (previous?.count ?? 0),
      capped: row.capped || previous?.capped === true,
      received_at:
        previous && Date.parse(previous.received_at) > received
          ? previous.received_at
          : row.received_at,
    });
  }
  return mobileWorkflowRead({
    ...header,
    rows: [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, row]) => row),
  });
}

/** Optional, bounded aggregate read; no member lookup, write, provider call or timer. */
export function createEmployeeMobileWorkflows<Actor = EmployeeActor>(
  application: EmployeeApplication<Actor>,
  enabled = false,
) {
  const authorize = async (actor: Actor, signal: AbortSignal) => {
    const operator = await application.authorize(actor, signal);
    signal.throwIfAborted();
    if (
      !record(operator) ||
      !record(operator.capabilities) ||
      operator.capabilities.operations_read !== true
    )
      throw Object.assign(Error('Operations access required'), { status: 403 });
  };
  return async (actor: Actor, signal: AbortSignal) => {
    await authorize(actor, signal);
    if (!enabled) return { source: 'device_reported', enabled: false };
    let result: unknown;
    try {
      result = await application.command(
        actor,
        { name: 'get_admin_mobile_workflows_v1', args: {} },
        signal,
      );
    } catch {
      result = null;
    }
    await authorize(actor, signal);
    const data = projectMobileWorkflowHours(result);
    return {
      source: 'device_reported',
      enabled: data.status !== 'disabled',
      ...(data.status === 'ready' ? { checked_at: data.checked_at, rows: data.rows } : {}),
    };
  };
}
