import { createEmployeeHealth } from './employee-health.mts';
import type { EmployeeMonitoringConfig } from './employee-health.mts';
import { developmentFailure } from './admin-development.mts';
import type { DevelopmentCall, DevelopmentInvoke } from './admin-development.mts';
import { record } from './portal-contracts.mts';
import type { PortalFetch } from './portal-contracts.mts';

/** Same bounded monitoring reads, with revocable staging developer authority. */
export function createDevelopmentHealth(
  invoke: DevelopmentInvoke,
  monitoring: EmployeeMonitoringConfig,
  dependencies: { upstream?: PortalFetch; now?: () => number } = {},
): DevelopmentInvoke {
  if (
    monitoring.environment !== 'staging' ||
    monitoring.organization !== 'doji-i0' ||
    JSON.stringify(monitoring.projectIds) !== '["4512328707342336"]' ||
    JSON.stringify(monitoring.projectSlugs) !== '["doji-staging"]' ||
    !monitoring.token
  )
    throw developmentFailure();
  type Context = { token: string; call: DevelopmentCall };
  const command = async (
    context: Context,
    input: { name: string; args: Record<string, unknown> },
    signal: AbortSignal,
  ) => {
    const value = await invoke(context.token, { ...context.call, ...input }, signal);
    if (!record(value) || value.ok !== true)
      throw developmentFailure(record(value) && value.code === '42501' ? 403 : 503);
    return value.result;
  };
  const authorize = (context: Context, signal: AbortSignal) =>
    command(context, { name: 'get_admin_portal_session_v3', args: {} }, signal);
  const health = createEmployeeHealth<Context>({ authorize, command }, monitoring, {
    ...dependencies,
    workflowHealthEnabled: true,
  });
  return async (token, call, signal) => {
    if (call.name !== 'portal_platform_health_v1') return invoke(token, call, signal);
    if (!call.persona || Object.keys(call.args).length) throw developmentFailure(400);
    const context = { token, call };
    const result = await health(context, signal);
    const operator = await authorize(context, signal);
    if (
      !record(operator) ||
      !record(operator.capabilities) ||
      operator.capabilities.operations_read !== true
    )
      throw developmentFailure(403);
    signal.throwIfAborted();
    return { ok: true, result };
  };
}
