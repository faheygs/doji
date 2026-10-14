import { focusManager, onlineManager, type QueryClient } from '@tanstack/react-query';
import { reconcileAppQueries, suspendAppReads } from './reconcileQueries';

export type NativeNetworkState = {
  type?: string;
  isConnected?: boolean;
  isInternetReachable?: boolean;
};

function permitsRead(state?: NativeNetworkState): boolean {
  return state?.type !== 'NONE' && state?.isConnected !== false && state?.isInternetReachable !== false;
}

/** Native read availability, not a claim that the server is reachable. No probes or polling. */
export function createNativeReadLifecycle(queryClient: QueryClient, options: {
  active: boolean;
  network?: NativeNetworkState;
  userId?: string;
  isAdmin: boolean;
  isBanned: boolean;
  isCurrent: () => boolean;
  refreshProfile: () => void;
}) {
  let active = options.active;
  let connected = permitsRead(options.network); // Unknown connectivity must not strand reads.
  let available = true;
  let disposed = false;
  let generation = 0;
  let cancellation = Promise.resolve();

  const update = () => {
    const next = active && connected;
    if (next === available) return;
    available = next;
    const current = ++generation;
    if (!next) {
      onlineManager.setOnline(false);
      cancellation = suspendAppReads(queryClient, options.isAdmin);
      return;
    }
    // Cancellation aborts old fetch/auth-wait observers before a fresh request begins.
    void cancellation.then(() => {
      if (disposed || generation !== current || !available || !options.isCurrent()) return;
      // Invalidate while paused, then release once. Existing paused fetches deduplicate.
      if (!options.isBanned) {
        void reconcileAppQueries(queryClient, {
          userId: options.userId, isAdmin: options.isAdmin, force: true,
        }).catch(() => {});
      }
      onlineManager.setOnline(true);
      if (options.userId) options.refreshProfile();
    });
  };

  // A newly mounted account must not inherit a disposed account's paused manager.
  onlineManager.setOnline(active && connected);
  focusManager.setFocused(active);
  update();
  return {
    appState(value: string) {
      if (disposed) return;
      active = value === 'active';
      // Close availability before focus notifications can resume retries.
      update();
      focusManager.setFocused(active);
    },
    network(state: NativeNetworkState) {
      if (disposed) return;
      connected = permitsRead(state);
      update();
    },
    dispose() { disposed = true; generation += 1; },
  };
}
