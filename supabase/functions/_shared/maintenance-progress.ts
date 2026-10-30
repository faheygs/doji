type QueueReader = { from(table: string): { select(columns: string): { limit(count: number): {
  abortSignal(signal: AbortSignal): PromiseLike<{ data: unknown; error: unknown }>;
} } } };

/** Full pages require another bounded turn; partial failures must never look drained. */
export class MaintenanceProgress {
  private remaining = new Set<string>();
  private deferred = false;

  page(queue: string, count: number, limit: number): void {
    if (count >= limit) this.remaining.add(queue);
    else this.remaining.delete(queue);
  }

  defer(): void { this.deferred = true; }

  result(otherWork: boolean): { hasMore: boolean; retryAfterMs?: number } {
    const hasMore = otherWork || this.remaining.size > 0 || this.deferred;
    // Account backoff and media leases can hide work from claim readers. A slow
    // recovery turn avoids hot-looping held objects or an unavailable provider.
    return { hasMore, ...(this.deferred ? { retryAfterMs: 3_600_000 } : {}) };
  }
}

/** Presence, not an expensive total count; failed reads cannot mean drained.
 * Protected or not-yet-retryable work only wakes maintenance later: existing
 * claim and deletion guards still decide eligibility.
 */
export async function cleanupQueued(database: QueueReader): Promise<boolean> {
  const pending = await Promise.all([
    database.from('media_objects_pending_delete').select('id').limit(1).abortSignal(AbortSignal.timeout(5000)),
    database.from('account_deletion_cleanup').select('user_id').limit(1).abortSignal(AbortSignal.timeout(5000)),
  ]);
  if (pending.some(result => result.error || !Array.isArray(result.data))) throw new Error('Cleanup queue status unavailable');
  return pending.some(result => Array.isArray(result.data) && result.data.length > 0);
}
