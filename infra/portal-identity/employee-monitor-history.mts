import type { EmployeeApplication, EmployeeActor } from './employee-contracts.mts';
import { record } from './portal-contracts.mts';

const families = new Set([
  'apns-provider-credentials',
  'domain-outbox-exhausted',
  'push-fanout-exhausted',
  'domain-outbox-delayed',
  'realtime-delivery-degraded',
  'operational-health-check-failed',
  'monitor-heartbeat-missing',
]);
const monitor = (value: unknown) => value === 'worker' || value === 'watchdog';
const family = (value: unknown) => typeof value === 'string' && families.has(value);
const timestamp = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));

function projectHistory(value: unknown) {
  if (
    !record(value) ||
    typeof value.enabled !== 'boolean' ||
    !Array.isArray(value.latest) ||
    value.latest.length !== 2 ||
    !Array.isArray(value.incidents) ||
    value.incidents.length > 25 ||
    JSON.stringify(value).length > 32768
  )
    return null;
  // Disabled capture may retain evidence in SQL, but never releases it through this read.
  if (!value.enabled) return { enabled: false, available: false };
  const seen = new Set<unknown>(),
    latest = [],
    incidents = [];
  for (const row of value.latest) {
    if (!record(row) || !monitor(row.monitor) || seen.has(row.monitor)) return null;
    seen.add(row.monitor);
    if (row.observed_at === null) {
      if (row.state !== null || row.family !== null) return null;
    } else if (
      !timestamp(row.observed_at) ||
      typeof row.state !== 'string' ||
      !['healthy', 'degraded', 'unavailable'].includes(row.state) ||
      (row.state === 'healthy' ? row.family !== null : !family(row.family))
    )
      return null;
    latest.push({
      monitor: row.monitor,
      observed_at: row.observed_at,
      state: row.state,
      family: row.family,
    });
  }
  let previous = Infinity;
  for (const row of value.incidents) {
    if (
      !record(row) ||
      !Number.isSafeInteger(row.id) ||
      Number(row.id) <= 0 ||
      Number(row.id) >= previous ||
      !monitor(row.monitor) ||
      !family(row.family) ||
      !timestamp(row.opened_at) ||
      !timestamp(row.last_observed_at) ||
      Date.parse(row.last_observed_at) < Date.parse(row.opened_at)
    )
      return null;
    if (row.ended_at === null) {
      if (row.ended_reason !== null) return null;
    } else if (
      !timestamp(row.ended_at) ||
      Date.parse(row.ended_at) < Date.parse(row.last_observed_at) ||
      typeof row.ended_reason !== 'string' ||
      !['recovered', 'superseded'].includes(row.ended_reason)
    )
      return null;
    previous = Number(row.id);
    incidents.push({
      id: row.id,
      monitor: row.monitor,
      family: row.family,
      opened_at: row.opened_at,
      last_observed_at: row.last_observed_at,
      ended_at: row.ended_at,
      ended_reason: row.ended_reason,
    });
  }
  // Never spread database rows: schema additions and diagnostics are not browser contracts.
  return { enabled: true, available: true, recent_limit: 25, latest, incidents };
}

/** Fixed recent page, no polling, provider calls or implied whole-platform recovery. */
export function createEmployeeMonitorHistory<Actor = EmployeeActor>(
  application: EmployeeApplication<Actor>,
  enabled = false,
) {
  const authorize = async (actor: Actor, signal: AbortSignal) => {
    const value = await application.authorize(actor, signal);
    signal.throwIfAborted();
    if (
      !record(value) ||
      !record(value.capabilities) ||
      value.capabilities.operations_read !== true
    )
      throw Object.assign(Error('Operations access required'), { status: 403 });
  };
  return async (actor: Actor, signal: AbortSignal) => {
    await authorize(actor, signal);
    if (!enabled) return { enabled: false, available: false };
    let result: unknown;
    try {
      result = await application.command(
        actor,
        { name: 'get_admin_monitor_history_v1', args: {} },
        signal,
      );
    } catch {
      result = null;
    }
    await authorize(actor, signal);
    // Observation times are returned unchanged; a successful history read does not refresh them.
    return projectHistory(result) ?? { enabled: true, available: false };
  };
}
