import {
  validWorkflowPair,
  type WorkflowPhase as Phase,
  type WorkflowOutcome as Outcome,
  type WorkflowCount,
} from '../contracts/mobileWorkflowTelemetry';
type Count = { minute: number; phase: Phase; outcome: Outcome; count: number; capped: boolean };
const MINUTE = 60_000;
const WINDOW = 15;
const LIMIT = 1000;

/** Device-reported attempts, not unique answers, reward receipts or a success rate.
 * Memory only; no sender, persistence, timers or account/content identifiers.
 */
export class SubmissionOutcomeCounts {
  private rows = new Map<string, Count>();
  private latestMinute = -1;

  reset(): void {
    this.rows.clear();
    this.latestMinute = -1;
  }

  private advance(now: number): number | null {
    if (!Number.isSafeInteger(now) || now < 0) return null;
    const minute = Math.floor(now / MINUTE);
    // A backwards device clock invalidates the reporting window; do not relabel old counts.
    if (minute < this.latestMinute) this.reset();
    this.latestMinute = minute;
    for (const [key, row] of this.rows) if (row.minute <= minute - WINDOW) this.rows.delete(key);
    return minute;
  }

  record(phase: Phase, outcome: Outcome, now: number): void {
    if (!validWorkflowPair(phase, outcome)) return;
    const minute = this.advance(now);
    if (minute === null) return;
    const key = `${minute}:${phase}:${outcome}`;
    const row = this.rows.get(key) ?? { minute, phase, outcome, count: 0, capped: false };
    if (row.count < LIMIT) row.count += 1;
    else row.capped = true;
    this.rows.set(key, row);
  }

  snapshot(now: number): { source: 'device_reported'; windowMinutes: number; rows: Count[] } {
    const minute = this.advance(now);
    return {
      source: 'device_reported',
      windowMinutes: WINDOW,
      rows: minute === null ? [] : [...this.rows.values()].map((row) => ({ ...row })),
    };
  }

  /** Detach once before best-effort transport. Uncertain uploads are never retried. */
  drain(now: number): WorkflowCount[] {
    const rows = this.snapshot(now).rows;
    this.reset();
    const totals = new Map<string, WorkflowCount>();
    for (const row of rows) {
      const key = `${row.phase}:${row.outcome}`;
      const total = totals.get(key) ?? {
        phase: row.phase,
        outcome: row.outcome,
        count: 0,
        capped: false,
      };
      total.count += row.count;
      total.capped ||= row.capped;
      totals.set(key, total);
    }
    return [...totals.values()];
  }
}

/** Query roots only; never retain a full query key, member ID, filter or input. */
export function workflowReadPhase(operation: unknown): Phase | null {
  if (typeof operation !== 'string') return null;
  if (['profile', 'publicProfile', 'moderationStatus'].includes(operation)) return 'profile_read';
  if (['userEvent', 'upcomingDoji'].includes(operation)) return 'doji_read';
  if (['feed', 'lockedFeed', 'post', 'profilePost', 'pollResults'].includes(operation))
    return 'feed_read';
  if (
    ['friends', 'friendRequests', 'comments', 'notifications', 'notificationCenter'].includes(
      operation,
    )
  )
    return 'social_read';
  if (
    ['leaderboard', 'badges', 'userBadges', 'shop', 'shopItems', 'userShopItems'].includes(
      operation,
    )
  )
    return 'economy_read';
  return null;
}
