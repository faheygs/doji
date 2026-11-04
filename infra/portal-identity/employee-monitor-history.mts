import type { EmployeeApplication, EmployeeActor } from './employee-contracts.mts';
import { record } from './portal-contracts.mts';

/** Fixed recent page, no polling, provider calls or implied whole-platform recovery. */
export function createEmployeeMonitorHistory<Actor = EmployeeActor>(application: EmployeeApplication<Actor>, enabled = false) {
  const authorize = async (actor: Actor, signal: AbortSignal) => {
    const value = await application.authorize(actor, signal);
    signal.throwIfAborted();
    if (!record(value) || !record(value.capabilities) || value.capabilities.operations_read !== true)
      throw Object.assign(Error('Operations access required'), { status: 403 });
  };
  return async (actor: Actor, signal: AbortSignal) => {
    await authorize(actor, signal);
    if (!enabled) return { enabled: false, available: false };
    let result: unknown;
    try {
      result = await application.command(actor, { name: 'get_admin_monitor_history_v1', args: {} }, signal);
    } catch { result = null; }
    await authorize(actor, signal);
    if (!record(result) || typeof result.enabled !== 'boolean' || !Array.isArray(result.latest)
      || result.latest.length !== 2 || !Array.isArray(result.incidents) || result.incidents.length > 25
      || JSON.stringify(result).length > 32768) return { enabled: true, available: false };
    // Observation times are returned unchanged; a successful history read does not refresh them.
    return { ...result, available: true, recent_limit: 25 };
  };
}
