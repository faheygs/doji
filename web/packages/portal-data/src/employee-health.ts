import { record, uuid } from '../../../../website/admin-portal/workflow-contracts.mts';
import type { EmployeeSessionController } from './employee-session';

const text = (v: unknown, limit = 500) => (typeof v === 'string' ? v.slice(0, limit) : null);
const date = (v: unknown) =>
  typeof v === 'string' && Number.isFinite(Date.parse(v)) ? new Date(v).toISOString() : null;
const metric = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const boolean = (v: unknown) => (typeof v === 'boolean' ? v : null);
const operationalMetrics = [
  'realtime_p95_ms_5m',
  'realtime_max_ms_5m',
  'realtime_sample_count_5m',
  'realtime_over_5s_5m',
  'outbox_overdue',
  'outbox_exhausted',
  'push_stale_shards',
  'push_exhausted_shards',
  'apns_provider_credential_errors',
] as const;
const historyMetrics = [
  'realtime_p95_ms',
  'realtime_max_ms',
  'realtime_sample_count',
  'realtime_over_5s',
  'outbox_total',
  'outbox_unpublished',
  'outbox_exhausted',
  'push_shards_total',
  'push_shards_completed',
  'push_shards_expired',
  'push_shards_exhausted',
  'participant_count',
  'post_count',
] as const;
function metrics<K extends string>(value: Record<string, unknown>, keys: readonly K[]) {
  return Object.fromEntries(keys.map((key) => [key, metric(value[key])])) as Record<
    K,
    number | null
  >;
}
function issueLink(value: unknown) {
  if (typeof value !== 'string' || value.length > 1000) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^(?:[a-z0-9-]+\.)*sentry\.io$/i.test(url.hostname) &&
      /^\/(?:organizations\/[a-z0-9-]+\/)?issues\/\d+\/?$/.test(url.pathname)
      ? url.origin + url.pathname
      : null;
  } catch {
    return null;
  }
}
/** Project only the bounded aggregate contract; never retain raw provider envelopes. */
export function healthSnapshot(value: unknown) {
  if (!record(value) || !record(value.operational) || !record(value.sentry))
    throw Error('Invalid health snapshot.');
  const op = value.operational,
    source = value.sentry;
  const validIssues =
    Array.isArray(source.issues) && source.issues.length <= 25 && source.issues.every(record);
  if (Array.isArray(source.issues) && source.issues.length > 25)
    throw Error('Unbounded issue response.');
  const issues = validIssues
    ? (source.issues as Record<string, unknown>[]).map((issue) => ({
        id: text(issue.id, 80),
        title: text(issue.title) || 'Production issue',
        project: text(issue.project, 100),
        level: text(issue.level, 30),
        status: text(issue.status, 30),
        event_count: metric(issue.event_count),
        affected_users: metric(issue.affected_users),
        first_seen: date(issue.first_seen),
        last_seen: date(issue.last_seen),
        permalink: issueLink(issue.permalink),
      }))
    : [];
  return {
    generated_at: date(value.generated_at),
    operational: {
      ...metrics(op, operationalMetrics),
      available: op.available === true,
      healthy: boolean(op.healthy),
      checked_at: date(op.checked_at),
    },
    sentry: {
      configured: boolean(source.configured),
      available: source.available === true && validIssues && date(source.observed_at) !== null,
      observed_at: date(source.observed_at),
      upstream_status: metric(source.upstream_status),
      issues,
    },
  };
}
export function healthHistory(value: unknown) {
  if (
    !record(value) ||
    !Array.isArray(value.items) ||
    value.items.length > 12 ||
    !value.items.every((row) => record(row) && uuid(row.daily_event_id))
  )
    throw Error('Invalid Doji health history.');
  const ids = new Set<string>();
  return value.items.map((row: Record<string, unknown>) => {
    const id = row.daily_event_id as string;
    if (ids.has(id)) throw Error('Duplicate Doji health summary.');
    ids.add(id);
    return {
      ...metrics(row, historyMetrics),
      daily_event_id: id,
      title: text(row.title) || 'Doji',
      healthy: boolean(row.healthy),
      fires_at: date(row.fires_at),
      closes_at: date(row.closes_at),
      observed_through: date(row.observed_through),
      finalized_at: date(row.finalized_at),
      captured_at: date(row.captured_at),
    };
  });
}
export const readEmployeeHealth = (controller: EmployeeSessionController, signal: AbortSignal) =>
  controller.read(
    'operations_read',
    '/portal/admin/platform-health',
    undefined,
    healthSnapshot,
    signal,
  );
export const readEmployeeHealthHistory = (
  controller: EmployeeSessionController,
  signal: AbortSignal,
) =>
  controller.read(
    'operations_read',
    '/portal/admin/platform-health-history?limit=12',
    undefined,
    healthHistory,
    signal,
  );
export type EmployeeHealth = ReturnType<typeof healthSnapshot>;
export type EmployeeHealthHistory = ReturnType<typeof healthHistory>;
