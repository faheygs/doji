import type { QueryClient } from '@tanstack/react-query';

type BatchState = {
  roots: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: Promise<unknown> | null;
  lastFlushAt: number;
};

const batches = new WeakMap<QueryClient, BatchState>();
export const REALTIME_BATCH_WINDOW_MS = 80;
export const REALTIME_MIN_REFRESH_GAP_MS = 350;

function runInvalidation(client: QueryClient, roots: Set<string>) {
  return client.invalidateQueries(
    {
      predicate: (query) => {
        const root = query.queryKey[0];
        return typeof root === 'string' && roots.has(root);
      },
      refetchType: 'active',
    },
    { cancelRefetch: false },
  );
}

export function invalidateQueryRoots(client: QueryClient, roots: Iterable<string>) {
  const pending = new Set(roots);
  if (pending.size === 0) return Promise.resolve();
  const scheduled = batches.get(client);
  if (scheduled) {
    for (const root of pending) scheduled.roots.delete(root);
    if (scheduled.timer && scheduled.roots.size === 0) {
      clearTimeout(scheduled.timer);
      scheduled.timer = null;
    }
  }
  return runInvalidation(client, pending);
}

function stateFor(client: QueryClient): BatchState {
  const existing = batches.get(client);
  if (existing) return existing;
  const created: BatchState = { roots: new Set(), timer: null, inFlight: null, lastFlushAt: 0 };
  batches.set(client, created);
  return created;
}

function armFlush(client: QueryClient, state: BatchState, requestedDelay: number) {
  if (state.timer || state.inFlight || state.roots.size === 0) return;
  const sinceLastFlush = Date.now() - state.lastFlushAt;
  const cadenceDelay = Math.max(0, REALTIME_MIN_REFRESH_GAP_MS - sinceLastFlush);
  state.timer = setTimeout(() => {
    state.timer = null;
    if (state.inFlight || state.roots.size === 0) return;
    const pending = new Set(state.roots);
    state.roots.clear();
    state.lastFlushAt = Date.now();
    state.inFlight = runInvalidation(client, pending).finally(() => {
      state.inFlight = null;
      armFlush(client, state, REALTIME_BATCH_WINDOW_MS);
    });
  }, Math.max(0, requestedDelay, cadenceDelay));
}

/**
 * Coalesces duplicate Ably/Supabase hints into one cache traversal. The window
 * is shorter than a rendered frame sequence but long enough to collect the
 * outbox event and matching database row event.
 */
export function scheduleQueryInvalidation(
  client: QueryClient,
  roots: Iterable<string>,
  delayMs = REALTIME_BATCH_WINDOW_MS,
) {
  const state = stateFor(client);
  for (const root of roots) state.roots.add(root);
  armFlush(client, state, delayMs);
}

export function cancelScheduledInvalidations(client: QueryClient) {
  const state = batches.get(client);
  if (!state) return;
  if (state.timer) clearTimeout(state.timer);
  state.timer = null;
  state.roots.clear();
}
