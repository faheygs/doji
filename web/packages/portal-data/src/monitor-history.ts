import { record } from '../../../../website/admin-portal/workflow-contracts.mts';

const families = [
  'apns-provider-credentials',
  'domain-outbox-exhausted',
  'push-fanout-exhausted',
  'domain-outbox-delayed',
  'realtime-delivery-degraded',
  'operational-health-check-failed',
  'monitor-heartbeat-missing',
] as const;
export type MonitorFamily = (typeof families)[number];
type Monitor = 'worker' | 'watchdog';
const monitor = (v: unknown): v is Monitor => v === 'worker' || v === 'watchdog';
const family = (v: unknown): v is MonitorFamily =>
  typeof v === 'string' && families.includes(v as MonitorFamily);
const date = (v: unknown): string | null =>
  typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v))
    ? new Date(v).toISOString()
    : null;
export function monitorHistory(value: unknown) {
  if (value == null || (record(value) && value.enabled === false))
    return { status: 'disabled' as const, latest: [], incidents: [] };
  const unavailable = { status: 'unavailable' as const, latest: [], incidents: [] };
  if (
    !record(value) ||
    value.enabled !== true ||
    value.available !== true ||
    !Array.isArray(value.latest) ||
    value.latest.length !== 2 ||
    !Array.isArray(value.incidents) ||
    value.incidents.length > 25
  )
    return unavailable;
  const seen = new Set<string>();
  const latest = [];
  for (const row of value.latest) {
    if (!record(row) || !monitor(row.monitor) || seen.has(row.monitor)) return unavailable;
    seen.add(row.monitor);
    const at = date(row.observed_at);
    if (row.observed_at !== null && !at) return unavailable;
    if (
      at ? !['healthy', 'degraded', 'unavailable'].includes(String(row.state)) : row.state !== null
    )
      return unavailable;
    if (row.family !== null && !family(row.family)) return unavailable;
    if (at && (row.state === 'healthy' ? row.family !== null : row.family === null))
      return unavailable;
    if (!at && row.family !== null) return unavailable;
    latest.push({
      monitor: row.monitor,
      observed_at: at,
      state: row.state as 'healthy' | 'degraded' | 'unavailable' | null,
    });
  }
  const incidents = [];
  let previous = Infinity;
  for (const row of value.incidents) {
    if (
      !record(row) ||
      !Number.isSafeInteger(row.id) ||
      Number(row.id) <= 0 ||
      Number(row.id) >= previous ||
      !monitor(row.monitor) ||
      !family(row.family)
    )
      return unavailable;
    const opened = date(row.opened_at),
      last = date(row.last_observed_at),
      ended = date(row.ended_at);
    if (
      !opened ||
      !last ||
      Date.parse(last) < Date.parse(opened) ||
      (row.ended_at !== null && (!ended || Date.parse(ended) < Date.parse(last))) ||
      (ended
        ? !['recovered', 'superseded'].includes(String(row.ended_reason))
        : row.ended_reason !== null)
    )
      return unavailable;
    previous = Number(row.id);
    incidents.push({
      id: previous,
      monitor: row.monitor,
      family: row.family,
      opened_at: opened,
      last_observed_at: last,
      ended_at: ended,
      ended_reason: row.ended_reason as 'recovered' | 'superseded' | null,
    });
  }
  return { status: 'ready' as const, latest, incidents };
}
export type MonitorHistory = ReturnType<typeof monitorHistory>;
