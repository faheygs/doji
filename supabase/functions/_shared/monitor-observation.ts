/** Shared Worker/Edge operational labels; no member data or provider diagnostics. */
export const monitorFamilies = [
  'apns-provider-credentials', 'domain-outbox-exhausted', 'push-fanout-exhausted',
  'domain-outbox-delayed', 'realtime-delivery-degraded',
  'operational-health-check-failed', 'monitor-heartbeat-missing',
] as const;
export type MonitorObservation = {
  id: string;
  observedAt: string;
  state: 'healthy' | 'degraded' | 'unavailable';
  family: (typeof monitorFamilies)[number] | null;
};
export function monitorProject(environment?: string): string | null {
  return environment === 'staging' ? 'ohrcupagdoilkwhecict'
    : environment === 'production' ? 'tvixsmqxotuvyjqzmjla' : null;
}
export function validMonitorObservation(value: unknown): value is MonitorObservation {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).sort().join(',') === 'family,id,observedAt,state'
    && typeof row.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.id)
    && typeof row.observedAt === 'string' && Number.isFinite(Date.parse(row.observedAt))
    && (row.state === 'healthy' ? row.family === null
      : (row.state === 'degraded' || row.state === 'unavailable')
        && monitorFamilies.some((family) => family === row.family));
}
