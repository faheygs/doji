type Check = { ok: boolean; reason: string };
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** Shared HTTP and external-probe policy: transport success never renews source time. */
export function assessMonitorHeartbeat(value: unknown, environment: string, now = Date.now()): Check {
  if (!record(value) || value.environment !== environment || !record(value.heartbeat))
    return { ok: false, reason: 'invalid_response' };
  const row = value.heartbeat;
  if (row.enabled !== true) return { ok: false, reason: 'disabled' };
  const time = (key: string) => typeof row[key] === 'string' ? Date.parse(row[key]) : NaN;
  const checked = time('checked_at'), observed = time('observed_at'), received = time('received_at');
  if (![checked, observed, received, now].every(Number.isFinite)) return { ok: false, reason: 'missing_observation' };
  if (Math.abs(now - checked) > 30_000 || observed > checked || received > checked || received < observed)
    return { ok: false, reason: 'clock_or_response_invalid' };
  if (checked - observed > 180_000 || checked - received > 180_000)
    return { ok: false, reason: 'monitor_heartbeat_stale' };
  if (row.state !== 'healthy') return { ok: false, reason: row.state === 'degraded' ? 'platform_degraded' : 'monitor_unavailable' };
  return { ok: true, reason: 'fresh_healthy_observation' };
}
