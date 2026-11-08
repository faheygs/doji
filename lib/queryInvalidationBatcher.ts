import type { QueryClient } from '@tanstack/react-query';

type BatchState = {
  pending: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  inFlight: boolean;
  lastFlushAt: number;
};

const batches = new WeakMap<QueryClient, Map<string, BatchState>>();
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
    for (const root of pending) {
      const state = scheduled.get(root);
      if (!state) continue;
      state.pending = false;
      if (state.timer) clearTimeout(state.timer);
      state.timer = null;
    }
  }
  return runInvalidation(client, pending);
}

function stateFor(client: QueryClient, root: string): BatchState {
  let roots = batches.get(client);
  if (!roots) {
    roots = new Map();
    batches.set(client, roots);
  }
  const existing = roots.get(root);
  if (existing) return existing;
  const created: BatchState = {
    pending: false,
    timer: null,
    inFlight: false,
    lastFlushAt: Number.NEGATIVE_INFINITY,
  };
  roots.set(root, created);
  return created;
}

function armFlush(client: QueryClient, root: string, state: BatchState, requestedDelay: number) {
  if (state.timer || state.inFlight || !state.pending) return;
  const sinceLastFlush = Date.now() - state.lastFlushAt;
  const cadenceDelay = Math.max(0, REALTIME_MIN_REFRESH_GAP_MS - sinceLastFlush);
  state.timer = setTimeout(
    () => {
      state.timer = null;
      if (state.inFlight || !state.pending) return;
      state.pending = false;
      state.lastFlushAt = Date.now();
      state.inFlight = true;
      const settled = () => {
        state.inFlight = false;
        // A previous account's completion cannot schedule work in a replacement batch.
        if (batches.get(client)?.get(root) !== state) return;
        armFlush(client, root, state, REALTIME_BATCH_WINDOW_MS);
      };
      // Each family owns its wait/cadence; a stalled comments read cannot hold a
      // challenge update. Only a new hint requests another pass after a failure.
      void runInvalidation(client, new Set([root])).then(settled, settled);
    },
    Math.max(0, requestedDelay, cadenceDelay),
  );
}

/**
 * Coalesces duplicate Ably hints per query family. Families refresh independently;
 * TanStack retains per-query single-flight behavior without cancelling active reads.
 */
export function scheduleQueryInvalidation(
  client: QueryClient,
  roots: Iterable<string>,
  delayMs = REALTIME_BATCH_WINDOW_MS,
) {
  for (const root of roots) {
    const state = stateFor(client, root);
    state.pending = true;
    armFlush(client, root, state, delayMs);
  }
}

export function cancelScheduledInvalidations(client: QueryClient) {
  const roots = batches.get(client);
  if (!roots) return;
  for (const state of roots.values()) {
    if (state.timer) clearTimeout(state.timer);
    state.timer = null;
    state.pending = false;
  }
  batches.delete(client);
}
