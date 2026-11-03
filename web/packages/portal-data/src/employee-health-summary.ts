import type { EmployeeSessionController } from './employee-session';

export type HealthSummary =
  | { enabled: false }
  | {
      enabled: true;
      available: boolean;
      observedAt: string | null;
      stale: boolean;
      deliveryHealthy: boolean | null;
      workflowsAvailable: boolean;
    };
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
export function healthSummary(value: unknown): HealthSummary {
  if (!record(value) || typeof value.enabled !== 'boolean')
    throw Error('Health summary unavailable.');
  if (!value.enabled) return { enabled: false };
  if (value.available === false)
    return {
      enabled: true,
      available: false,
      observedAt: null,
      stale: true,
      deliveryHealthy: null,
      workflowsAvailable: false,
    };
  if (
    value.available !== true ||
    typeof value.observed_at !== 'string' ||
    value.observed_at.length > 50 ||
    !Number.isFinite(Date.parse(value.observed_at)) ||
    typeof value.stale !== 'boolean' ||
    !record(value.operational) ||
    !record(value.workflows)
  )
    throw Error('Health summary is incomplete.');
  return {
    enabled: true,
    available: true,
    observedAt: value.observed_at,
    stale: value.stale,
    deliveryHealthy:
      value.operational.available === true && typeof value.operational.healthy === 'boolean'
        ? value.operational.healthy
        : null,
    workflowsAvailable: value.workflows.available === true && value.workflows.enabled === true,
  };
}
export function readHealthSummary(controller: EmployeeSessionController, signal: AbortSignal) {
  return controller.read(
    'operations_read',
    '/portal/admin/platform-health-summary',
    undefined,
    healthSummary,
    signal,
  );
}
export function healthSummaryLabel(
  data: HealthSummary | undefined,
  failed: boolean,
  online: boolean,
  now: number,
) {
  if (data?.enabled === false) return null;
  if (!online) return 'Health: offline';
  if (failed) return 'Health: unavailable';
  if (!data) return 'Health: checking';
  if (!data.available || data.deliveryHealthy === null) return 'Health: unavailable';
  const at = Date.parse(data.observedAt ?? '');
  if (data.stale || !Number.isFinite(at) || at > now + 30000 || now - at > 180000)
    return 'Health: outdated';
  return data.deliveryHealthy ? 'Health: limited coverage' : 'Health: attention needed';
}
