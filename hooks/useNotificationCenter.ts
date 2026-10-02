import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { executeCommand } from '../lib/commandGateway';
import { useAuthStore } from '../stores/useAuthStore';
import type { NotificationCenterState, NotificationDismissal } from '../types/database';
import type { NotificationCenterItem } from '../lib/notificationCenterTypes';
import { parseDate } from '../utils/time';
import { createRequestSignal, runAbortableQuery } from '../lib/requestSignal';
import { awaitReadSignal } from '../lib/awaitReadSignal';
import { rpcQueryError } from '../lib/rpcQueryError';
import { canKeepQueryDataOnError } from '../lib/queryDisplayState';
import { isNotificationVisible, isNotificationUnread } from '../lib/notificationVisibility';
import { createNotificationHistoryQueue, type NotificationHistory } from '../lib/notificationHistoryQueue';
import { groupNotificationItems } from '../lib/notificationGrouping';
import {
  attentionReceiptsForItems,
  dismissPresentedNotificationsForReceipts,
  type NotificationAttentionScope,
} from '../lib/notificationAttention';
import type { NotificationAttentionReceipt } from '../types/database';

export type { NotificationCenterItem } from '../lib/notificationCenterTypes';
export const NOTIFICATION_CENTER_PREFIX = 'notificationCenter' as const;
const HISTORY_DAYS = 30;
const KEYS = {
  cleared: '@doit/bell-cleared-at',
  opened: '@doit/bell-last-opened',
  dismissed: '@doit/dismissed-notif-keys',
};
type Dismissed = Map<string, string>;
type NotificationBootstrap = {
  state: NotificationCenterState | null;
  dismissals: NotificationDismissal[];
  items: NotificationCenterItem[];
};
const storageKey = (key: string, uid?: string) => (uid ? `${key}:${uid}` : key);

function latestIso(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return parseDate(a).getTime() >= parseDate(b).getTime() ? a : b;
}

function commandTimestamp(value: unknown, key: string, fallback: string): string {
  if (!value || typeof value !== 'object') return fallback;
  const timestamp = (value as Record<string, unknown>)[key];
  return typeof timestamp === 'string' && Number.isFinite(parseDate(timestamp).getTime())
    ? timestamp
    : fallback;
}

function parseDismissed(raw: string | null): Dismissed {
  if (!raw) return new Map();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      const migratedAt = new Date().toISOString();
      return new Map(
        parsed
          .filter((key): key is string => typeof key === 'string')
          .map((key) => [key, migratedAt]),
      );
    }
    if (parsed && typeof parsed === 'object') {
      return new Map(
        Object.entries(parsed).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    }
  } catch {
    /* Ignore corrupt or unsupported persisted dismissal state. */
  }
  return new Map();
}

const serializeDismissed = (value: Dismissed) => JSON.stringify(Object.fromEntries(value));

function mergeDismissed(local: Dismissed, remote: NotificationDismissal[]) {
  const merged = new Map<string, string>();
  for (const row of remote) merged.set(row.notification_key, row.dismissed_at);
  for (const [key, at] of local) merged.set(key, latestIso(merged.get(key) ?? null, at) ?? at);
  return merged;
}

function lowerSinceIso(clearedAt: string | null) {
  const clearedMs = clearedAt ? parseDate(clearedAt).getTime() : 0;
  const historyFloor = Math.floor(
    (Date.now() - HISTORY_DAYS * 86_400_000) / 60_000,
  ) * 60_000;
  return new Date(Math.max(clearedMs, historyFloor)).toISOString();
}

export function useNotificationCenter(_options: { deferInitialLoad?: boolean } = {}) {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user?.id);
  const [clearedAt, setClearedAt] = useState<string | null>(null);
  const [lastOpenedAt, setLastOpenedAt] = useState<string | null>(null);
  const [dismissedKeys, setDismissedKeys] = useState<Dismissed>(new Map());
  const historyRef = useRef<{ userId: string; queue: ReturnType<typeof createNotificationHistoryQueue>; isCurrent: () => boolean } | null>(null);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const prefsHydrated = Boolean(userId && hydratedUserId === userId);
  const [isClearing, setIsClearing] = useState(false);
  const pendingAttentionRef = useRef<Map<string, NotificationAttentionReceipt>>(new Map());
  const attentionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setIsClearing(false);
    setClearedAt(null);
    setLastOpenedAt(null);
    setDismissedKeys(new Map());
    setHydratedUserId(null);
    if (!userId) {
      return;
    }
    let cancelled = false;
    const isCurrent = () => !cancelled && useAuthStore.getState().session?.user?.id === userId;
    const request = createRequestSignal(undefined, 8_000);
    let ready!: () => void;
    const bootstrapped = new Promise<void>(resolve => { ready = resolve; });
    const persist = (state: NotificationHistory) => AsyncStorage.multiSet([
      [storageKey(KEYS.cleared, userId), state.clearedAt ?? ''],
      [storageKey(KEYS.opened, userId), state.lastOpenedAt ?? ''],
      [storageKey(KEYS.dismissed, userId), serializeDismissed(state.dismissed)],
    ]);
    const queue = createNotificationHistoryQueue({
      initial: { clearedAt: null, lastOpenedAt: null, dismissed: new Map() },
      isCurrent,
      publish: (state, clearing) => {
        setClearedAt(state.clearedAt);
        setLastOpenedAt(state.lastOpenedAt);
        setDismissedKeys(state.dismissed);
        setIsClearing(clearing);
      },
      execute: async action => {
        await bootstrapped;
        if (!isCurrent()) throw new Error('Notification account changed');
        const guard = { expectedUserId: userId, isCurrent };
        const result = action.kind === 'dismiss'
          ? await executeCommand('dismiss_notification', { p_notification_key: action.key, p_dismissed_at: action.at }, guard)
          : action.kind === 'clear'
            ? await executeCommand('clear_notification_history', { p_cleared_at: action.at }, guard)
            : await executeCommand('mark_notification_center_opened', { p_opened_at: action.at }, guard);
        if (result.error) throw result.error;
        return commandTimestamp(result.data, action.kind === 'dismiss' ? 'dismissed_at'
          : action.kind === 'clear' ? 'cleared_at' : 'last_opened_at', action.at);
      },
      persist,
    });
    historyRef.current = { userId, queue, isCurrent };
    void (async () => {
      const entries = await AsyncStorage.multiGet([
        storageKey(KEYS.cleared, userId),
        storageKey(KEYS.opened, userId),
        storageKey(KEYS.dismissed, userId),
      ]);
      if (!isCurrent()) return;
      const localCleared = entries[0][1] || null;
      const localOpened = entries[1][1] || null;
      const localDismissed = parseDismissed(entries[2][1]);
      try {
        if (request.signal.aborted) throw new Error('Request cancelled');
        const { data: auth, error: authError } = await awaitReadSignal(supabase.auth.getSession(), request.signal);
        if (!isCurrent()) return;
        if (authError || auth.session?.user.id !== userId) throw new Error('Notification authentication required');
        // This bootstrap also merges local dismissal history atomically. Bound
        // observation, but do not replay it or treat cancellation as rollback.
        const { data, error } = await awaitReadSignal(supabase
          .rpc('get_notification_center_bootstrap', {
            p_local_cleared_at: localCleared,
            p_local_last_opened_at: localOpened,
            p_local_dismissals: Object.fromEntries(localDismissed),
            p_limit: 200,
          })
          .setHeader('Authorization', `Bearer ${auth.session.access_token}`)
          .abortSignal(request.signal), request.signal);
        if (error) throw error;
        if (!isCurrent()) return;
        const bootstrap = data as unknown as NotificationBootstrap;
        const remote = bootstrap.state;
        const mergedCleared = latestIso(localCleared, remote?.cleared_at ?? null);
        const mergedOpened = latestIso(localOpened, remote?.last_opened_at ?? null);
        const mergedDismissed = mergeDismissed(
          localDismissed,
          bootstrap.dismissals ?? [],
        );
        queryClient.setQueryData(
          [NOTIFICATION_CENTER_PREFIX, 'snapshot', userId, lowerSinceIso(mergedCleared)],
          bootstrap.items ?? [],
        );
        const state = { clearedAt: mergedCleared, lastOpenedAt: mergedOpened, dismissed: mergedDismissed };
        queue.hydrate(state);
        setHydratedUserId(userId);
        await persist(state).catch(() => {});
      } catch {
        if (!isCurrent()) return;
        queue.hydrate({ clearedAt: localCleared, lastOpenedAt: localOpened, dismissed: localDismissed });
        setHydratedUserId(userId);
      } finally {
        request.cleanup();
      }
    })().catch(() => {
      if (isCurrent()) setHydratedUserId(userId);
    }).finally(() => { request.cleanup(); ready(); });
    return () => {
      cancelled = true;
      queue.stop();
      if (historyRef.current?.queue === queue) historyRef.current = null;
      ready();
      request.cancel(new Error('Notification bootstrap unmounted'));
    };
  }, [queryClient, userId]);

  const sinceIso = useMemo(() => lowerSinceIso(clearedAt), [clearedAt]);
  const snapshot = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'snapshot', userId, sinceIso],
    queryFn: async ({ signal }): Promise<NotificationCenterItem[]> => {
      const request = createRequestSignal(signal);
      try {
        if (request.signal.aborted) throw new Error('Request cancelled');
        const { data: auth, error: authError } = await awaitReadSignal(supabase.auth.getSession(), request.signal);
        if (authError || !auth.session || auth.session.user.id !== userId || signal.aborted) throw new Error('Authentication required');
        const { data } = await runAbortableQuery(supabase
          .rpc('get_notification_center_snapshot', {
            p_since: sinceIso,
            p_limit: 200,
          })
          .setHeader('Authorization', `Bearer ${auth.session.access_token}`), request.signal);
        return (data ?? []) as unknown as NotificationCenterItem[];
      } catch (error) {
        throw rpcQueryError(error, { abortSource: request.abortSource, timeoutMs: 8_000 });
      } finally {
        request.cleanup();
      }
    },
    enabled: Boolean(userId && prefsHydrated),
    staleTime: 15_000,
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[2] === userId ? previous : undefined,
  });

  const items = useMemo(
    () =>
      groupNotificationItems(prefsHydrated && (!snapshot.error || canKeepQueryDataOnError(snapshot.data, snapshot.error)) ? snapshot.data ?? [] : [])
        .filter((item) => isNotificationVisible(item, clearedAt, dismissedKeys)),
    [clearedAt, dismissedKeys, prefsHydrated, snapshot.data, snapshot.error],
  );
  const unreadCount = useMemo(() => {
    return items.filter((item) => isNotificationUnread(item, lastOpenedAt)).length;
  }, [items, lastOpenedAt]);

  const flushAttentionReceipts = useCallback(async () => {
    const account = historyRef.current;
    if (!userId || account?.userId !== userId || !account.isCurrent() || pendingAttentionRef.current.size === 0) return;
    const receipts = [...pendingAttentionRef.current.values()].slice(0, 100);
    for (const receipt of receipts) {
      pendingAttentionRef.current.delete(`${receipt.scope_kind}:${receipt.scope_id}`);
    }
    const { error } = await executeCommand('mark_notification_attention_seen', {
      p_receipts: receipts,
    }, { expectedUserId: userId, isCurrent: account.isCurrent }).catch(error => ({ error }));
    if (!account.isCurrent()) return;
    if (error) {
      for (const receipt of receipts) {
        const key = `${receipt.scope_kind}:${receipt.scope_id}`;
        const newer = pendingAttentionRef.current.get(key);
        if (!newer || parseDate(newer.seen_at).getTime() < parseDate(receipt.seen_at).getTime()) {
          pendingAttentionRef.current.set(key, receipt);
        }
      }
      return;
    }
    try {
      await dismissPresentedNotificationsForReceipts(receipts);
    } catch {
      /* OS notification cleanup is best effort; the durable seen state succeeded. */
    }
    if (account.isCurrent() && pendingAttentionRef.current.size > 0 && !attentionTimerRef.current) {
      attentionTimerRef.current = setTimeout(() => {
        attentionTimerRef.current = null;
        void flushAttentionReceipts();
      }, 400);
    }
  }, [userId]);

  const queueAttentionReceipts = useCallback((receipts: NotificationAttentionReceipt[]) => {
    if (!userId || historyRef.current?.userId !== userId || !historyRef.current.isCurrent() || receipts.length === 0) return;
    for (const receipt of receipts) {
      pendingAttentionRef.current.set(`${receipt.scope_kind}:${receipt.scope_id}`, receipt);
    }
    if (attentionTimerRef.current) return;
    attentionTimerRef.current = setTimeout(() => {
      attentionTimerRef.current = null;
      void flushAttentionReceipts();
    }, 400);
  }, [flushAttentionReceipts, userId]);

  const markItemsSeen = useCallback((visibleItems: readonly NotificationCenterItem[]) => {
    queueAttentionReceipts(attentionReceiptsForItems(visibleItems));
  }, [queueAttentionReceipts]);

  const markScopesSeen = useCallback((scopes: readonly NotificationAttentionScope[]) => {
    const seenAt = new Date().toISOString();
    queueAttentionReceipts(scopes
      .filter((scope) => Boolean(scope.scope_id))
      .map((scope) => ({ ...scope, seen_at: seenAt })));
  }, [queueAttentionReceipts]);

  useEffect(() => {
    const pendingAttention = pendingAttentionRef.current;
    pendingAttention.clear();
    if (attentionTimerRef.current) {
      clearTimeout(attentionTimerRef.current);
      attentionTimerRef.current = null;
    }
    return () => {
      pendingAttention.clear();
      if (attentionTimerRef.current) clearTimeout(attentionTimerRef.current);
      attentionTimerRef.current = null;
    };
  }, [userId]);

  const markBellOpened = useCallback(async () => {
    const account = historyRef.current;
    if (!userId || account?.userId !== userId || !account.isCurrent()) return;
    try { await account.queue.enqueue({ kind: 'open', at: new Date().toISOString() }); }
    catch { return; }
    if (account.isCurrent() && Platform.OS !== 'web') {
      try {
        const notifications = await import('expo-notifications');
        if (account.isCurrent()) await notifications.setBadgeCountAsync(0);
      } catch {
        /* unsupported */
      }
    }
  }, [userId]);

  const dismissItem = useCallback(
    async (key: string) => {
      const account = historyRef.current;
      if (!userId || account?.userId !== userId || !account.isCurrent()) return;
      await account.queue.enqueue({ kind: 'dismiss', key, at: new Date().toISOString() });
    },
    [userId],
  );

  const clearNotificationHistory = useCallback(async () => {
    const account = historyRef.current;
    if (!userId || account?.userId !== userId || !account.isCurrent()) return;
    await account.queue.enqueue({ kind: 'clear', at: new Date().toISOString() });
  }, [userId]);

  return {
    items,
    unreadCount,
    badgeCount: unreadCount,
    isLoading: !prefsHydrated || snapshot.isLoading,
    readError: snapshot.error,
    isRefetching: snapshot.isFetching,
    retryRead: () => snapshot.refetch({ cancelRefetch: false }),
    isClearing,
    markBellOpened,
    markItemsSeen,
    markScopesSeen,
    dismissItem,
    clearNotificationHistory,
    prefsHydrated,
  };
}
