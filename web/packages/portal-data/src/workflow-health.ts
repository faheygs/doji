import { record } from '../../../../website/admin-portal/workflow-contracts.mts';

export const workflowNames = {
  prelive: 'Prepare Doji',
  activate: 'Start Doji',
  close: 'Close Doji',
  close_targeted: 'Close selected Doji',
  maintenance: 'Cleanup',
} as const;
export const phaseNames = {
  command: 'Database command',
  operational_retention: 'Operational records',
  expired_media: 'Unused uploads',
  committed_intents: 'Completed upload reservations',
  push_endpoints: 'Inactive notification registrations',
  rate_limits: 'Expired request limits',
  post_media: 'Post media',
  account_media: 'Deleted-account media',
  queue_check: 'Remaining cleanup work',
  scheduler_logs: 'Scheduler history',
  complete: 'Completed',
} as const;
export const cleanupNames = {
  orphaned_media: 'Unused uploads removed',
  committed_media_intents: 'Upload reservations removed',
  stale_push_endpoints: 'Inactive notification registrations removed',
  expired_rate_limit_buckets: 'Expired request limits removed',
  deleted_post_media: 'Post media objects removed',
  deleted_account_media: 'Deleted-account cleanups completed',
  scheduler_succeeded_deleted: 'Old successful scheduler records removed',
  scheduler_failed_deleted: 'Old failed scheduler records removed',
} as const;
const outcomes = ['succeeded', 'failed', 'deferred'] as const;
function choice<T extends string>(value: unknown, keys: readonly T[]): T {
  if (typeof value !== 'string' || !keys.includes(value as T))
    throw Error('Invalid workflow category');
  return value as T;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw Error('Invalid workflow count');
  return value;
}
function timestamp(value: unknown): string {
  if (typeof value !== 'string' || value.length > 50 || !Number.isFinite(Date.parse(value)))
    throw Error('Invalid workflow time');
  return new Date(value).toISOString();
}
function counts(value: unknown) {
  if (!record(value)) throw Error('Invalid cleanup counts');
  return Object.fromEntries(
    Object.keys(cleanupNames)
      .filter((key) => Object.hasOwn(value, key))
      .map((key) => [key, count(value[key])]),
  ) as Partial<Record<keyof typeof cleanupNames, number>>;
}
function rows(value: unknown, limit: number) {
  if (!Array.isArray(value) || value.length > limit || !value.every(record))
    throw Error('Invalid workflow rows');
  return value as Record<string, unknown>[];
}
function category(row: Record<string, unknown>) {
  return {
    workflow: choice(row.workflow, Object.keys(workflowNames) as (keyof typeof workflowNames)[]),
    outcome: choice(row.outcome, outcomes),
  };
}
/** Unknown or malformed coverage stays unavailable independently of delivery/Sentry. */
export function workflowSnapshot(value: unknown) {
  if (!record(value) || value.available !== true) return null;
  try {
    if (typeof value.enabled !== 'boolean' || typeof value.retention_enabled !== 'boolean')
      return null;
    const observed_at = timestamp(value.observed_at);
    const endHour = Math.floor(Date.parse(observed_at) / 3600000) * 3600000;
    const seen = new Set<string>();
    const hours = rows(value.hours, 360).map((row) => {
      const item = {
        ...category(row),
        hour: timestamp(row.hour),
        attempts: count(row.attempts),
        elapsed_ms: count(row.elapsed_ms),
        counts: counts(row.counts),
      };
      const key = `${item.workflow}:${item.outcome}:${item.hour}`;
      const hour = Date.parse(item.hour);
      if (
        seen.has(key) ||
        item.attempts === 0 ||
        hour % 3600000 !== 0 ||
        hour > endHour ||
        hour < endHour - 23 * 3600000
      )
        throw Error('Invalid workflow bucket');
      seen.add(key);
      return item;
    });
    seen.clear();
    const receipts = rows(value.receipts, 15).map((row) => {
      const item = {
        ...category(row),
        observed_at: timestamp(row.observed_at),
        phase: choice(row.phase, Object.keys(phaseNames) as (keyof typeof phaseNames)[]),
        counts: counts(row.counts),
      };
      const key = `${item.workflow}:${item.outcome}`;
      if (seen.has(key)) throw Error('Duplicate workflow receipt');
      seen.add(key);
      return item;
    });
    let scheduler = null;
    if (value.scheduler_receipt !== null) {
      const row = value.scheduler_receipt;
      if (!record(row) || typeof row.has_more !== 'boolean') return null;
      scheduler = {
        observed_at: timestamp(row.observed_at),
        scanned: count(row.scanned),
        succeeded_deleted: count(row.succeeded_deleted),
        failed_deleted: count(row.failed_deleted),
        has_more: row.has_more,
      };
    }
    return {
      enabled: value.enabled,
      retention_enabled: value.retention_enabled,
      observed_at,
      hours,
      receipts,
      scheduler,
    };
  } catch {
    return null;
  }
}
export type WorkflowHealth = ReturnType<typeof workflowSnapshot>;
