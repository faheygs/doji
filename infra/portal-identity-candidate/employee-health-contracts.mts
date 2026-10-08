// Default-off employee health feed. This fixed bridge does not admit member JWTs.
import type { EmployeeRouteContract } from './employee-route-contracts.mts';
export const employeeHealthSql =
  'select portal_identity_private.employee_health_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result';
export const employeeHealthContracts: Readonly<Record<string, EmployeeRouteContract>> =
  Object.freeze({
    get_admin_health_feed_v1: Object.freeze({ fields: [], types: [], defaults: {} }),
  });
export function healthVersions(value: unknown): Record<'delivery' | 'history' | 'sentry', string> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error('Health feed unavailable');
  const feed = value as Record<string, unknown>;
  if (feed.enabled !== true || !Array.isArray(feed.sources) || feed.sources.length > 3)
    throw Error('Health feed unavailable');
  const result = { delivery: '0', history: '0', sentry: '0' };
  const seen = new Set<string>();
  for (const entry of feed.sources) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry))
      throw Error('Invalid health version');
    const row = entry as Record<string, unknown>;
    if (
      typeof row.source !== 'string' ||
      !Object.hasOwn(result, row.source) ||
      seen.has(row.source) ||
      typeof row.revision !== 'string' ||
      !/^[1-9][0-9]{0,17}$/.test(row.revision) ||
      typeof row.observed_at !== 'string' ||
      !Number.isFinite(Date.parse(row.observed_at))
    )
      throw Error('Invalid health version');
    seen.add(row.source);
    result[row.source as keyof typeof result] = row.revision;
  }
  return result;
}
