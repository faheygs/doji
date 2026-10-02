import { parseDate } from '../utils/time';

export type NotificationHistory = {
  clearedAt: string | null;
  lastOpenedAt: string | null;
  dismissed: Map<string, string>;
};
export type NotificationHistoryAction =
  | { kind: 'dismiss'; key: string; at: string }
  | { kind: 'clear'; at: string }
  | { kind: 'open'; at: string };

const latest = (a: string | null, b: string) =>
  a && parseDate(a).getTime() > parseDate(b).getTime() ? a : b;

function apply(state: NotificationHistory, action: NotificationHistoryAction): NotificationHistory {
  if (action.kind === 'open') return { ...state, lastOpenedAt: latest(state.lastOpenedAt, action.at) };
  if (action.kind === 'clear') return { ...state, clearedAt: latest(state.clearedAt, action.at), dismissed: new Map() };
  return { ...state, dismissed: new Map(state.dismissed).set(action.key,
    latest(state.dismissed.get(action.key) ?? null, action.at)) };
}

/** One mounted account's in-memory intents, not an offline/retry queue.
 * Show every intent immediately, execute atomic commands in order, and replay
 * pending intents over confirmed receipts. A failure rolls back only itself.
 */
export function createNotificationHistoryQueue(options: {
  initial: NotificationHistory;
  isCurrent: () => boolean;
  publish: (state: NotificationHistory, clearing: boolean) => void;
  execute: (action: NotificationHistoryAction) => Promise<string>;
  persist: (state: NotificationHistory) => Promise<unknown>;
}) {
  let confirmed = options.initial;
  let stopped = false;
  let tail: Promise<void> = Promise.resolve();
  const pending: NotificationHistoryAction[] = [];
  let latestFlight: { key: string | null; action: NotificationHistoryAction; promise: Promise<void> } | null = null;
  const current = () => !stopped && options.isCurrent();
  const publish = () => {
    if (current()) options.publish(pending.reduce(apply, confirmed), pending.some(a => a.kind === 'clear'));
  };
  return {
    stop() { stopped = true; },
    hydrate(state: NotificationHistory) { confirmed = state; publish(); },
    enqueue(action: NotificationHistoryAction): Promise<void> {
      if (!current()) return Promise.resolve();
      const flightKey = action.kind === 'clear' ? 'clear'
        : action.kind === 'dismiss' ? `dismiss:${action.key}` : null;
      // Only adjacent duplicate intents coalesce: Dismiss A / Clear / Dismiss A
      // must retain the final dismissal, especially for actionable requests.
      if (flightKey && latestFlight?.key === flightKey && pending.includes(latestFlight.action)) {
        return latestFlight.promise;
      }
      pending.push(action);
      publish();
      const result = tail.then(async () => {
        if (!current()) return;
        try {
          const at = await options.execute(action);
          if (!current()) return;
          confirmed = apply(confirmed, { ...action, at });
        } catch (error) {
          if (current()) throw error;
        } finally {
          pending.splice(pending.indexOf(action), 1);
          publish();
        }
        if (!current()) return;
        // A disk failure must not undo an already committed server command.
        // Serialize writes too, so an older receipt cannot win on disk.
        try { await options.persist(confirmed); } catch { /* Bootstrap recovers server state. */ }
      });
      latestFlight = { key: flightKey, action, promise: result };
      tail = result.catch(() => {});
      return result;
    },
  };
}
