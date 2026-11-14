/** One reviewed staging monitor; not a caller-controlled provider proxy. */
export const stagingSentryChecksUrl =
  'https://sentry.io/api/0/projects/doji-i0/doji-staging/uptime/10858429/checks/?statsPeriod=5m&per_page=5';
export const stagingSentryMonitorUrl =
  'https://sentry.io/api/0/projects/doji-i0/doji-staging/uptime/10858429/';

/** Check rows can omit environment; only this independently verified binding permits that. */
export function assertStagingSentryMonitor(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('Invalid monitor');
  const monitor = value as Record<string, unknown>;
  if (monitor.id !== '10858429' || monitor.projectSlug !== 'doji-staging'
    || monitor.environment !== 'staging' || monitor.method !== 'GET' || monitor.status !== 'active'
    || monitor.intervalSeconds !== 60
    || monitor.url !== 'https://ohrcupagdoilkwhecict.supabase.co/functions/v1/operational-health/monitor-check')
    throw Error('Invalid monitor binding');
}

export type SentryMonitorObservation = {
  id: string;
  observedAt: string;
  state: 'healthy' | 'degraded' | 'unavailable';
  family: 'monitor-heartbeat-missing' | null;
};

/** Experimental provider schema: reject drift, preserve source time, never treat [] as healthy. */
export function sentryMonitorObservations(value: unknown, now: number, monitor: unknown): SentryMonitorObservation[] {
  assertStagingSentryMonitor(monitor);
  if (!Number.isFinite(now) || !Array.isArray(value) || value.length < 1 || value.length > 5) throw Error('Invalid checks');
  const ids = new Set<string>(), times = new Set<number>();
  const rows = value.map((row: unknown): SentryMonitorObservation => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('Invalid check');
    const r = row as Record<string, unknown>;
    const id = typeof r.uptimeCheckId === 'string' ? r.uptimeCheckId.replace(/-/g, '').toLowerCase() : '';
    const timestamp = typeof r.timestamp === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(r.timestamp)
      ? Date.parse(r.timestamp) : NaN;
    if (!/^[0-9a-f]{12}[1-5][0-9a-f]{3}[89ab][0-9a-f]{15}$/.test(id)
      || !Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== String(r.timestamp).replace('Z', '.000Z')
      || timestamp > now || (r.environment !== 'staging' && r.environment !== '')
      || !['success', 'failure', 'failure_incident'].includes(String(r.checkStatus))
      || ids.has(id) || times.has(timestamp)) throw Error('Invalid check');
    if (r.checkStatus === 'success' && (!Number.isInteger(r.httpStatusCode)
      || Number(r.httpStatusCode) < 200 || Number(r.httpStatusCode) > 299)) throw Error('Invalid success');
    ids.add(id); times.add(timestamp);
    return {
      id: `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`,
      observedAt: new Date(timestamp).toISOString(),
      state: r.checkStatus === 'success' ? 'healthy' : r.checkStatus === 'failure' ? 'degraded' : 'unavailable',
      family: r.checkStatus === 'success' ? null : 'monitor-heartbeat-missing',
    };
  }).sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
  // SQL retains only fresh observations. Old checks cannot renew evidence or recover an incident.
  const fresh = rows.filter(row => now - Date.parse(row.observedAt) <= 180000);
  if (!fresh.length) throw Error('No fresh check');
  return fresh;
}
