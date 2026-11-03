import type { EmployeeApplication, EmployeeActor } from './employee-contracts.mts';
import { record } from './portal-contracts.mts';

/** No aggregate/provider reads: only the fixed cached summary and fresh authority. */
export function createEmployeeHealthSummary<Actor = EmployeeActor>(
  application: EmployeeApplication<Actor>,
  enabled = false,
  summary = true,
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
    if (!enabled) return { enabled: false };
    let result: unknown;
    try {
      result = await application.command(
        actor,
        {
          name: 'get_admin_health_snapshot_v1',
          args: { p_summary: summary },
        },
        signal,
      );
    } catch {
      await authorize(actor, signal);
      // An unavailable SQL bridge is not a revoked employee. Avoid restore/probe loops.
      throw Object.assign(Error('Health summary unavailable'), { status: 503 });
    }
    // Revocation during a slow read must fence the returned cache just like other resources.
    await authorize(actor, signal);
    if (
      !record(result) ||
      typeof result.enabled !== 'boolean' ||
      JSON.stringify(result).length > (summary ? 4096 : 270336)
    )
      throw Object.assign(Error('Health summary unavailable'), { status: 503 });
    return result;
  };
}
