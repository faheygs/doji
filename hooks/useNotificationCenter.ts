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
import { createRequestSignal } from '../lib/requestSignal';
import { isNotificationVisible } from '../lib/notificationVisibility';
import { groupNotificationItems } from '../lib/notificationGrouping';

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
  const dismissedRef = useRef<Dismissed>(new Map());
  const clearingRef = useRef(false);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  useEffect(() => {
    if (!userId) {
      clearingRef.current = false;
      setIsClearing(false);
      setClearedAt(null);
      setLastOpenedAt(null);
      dismissedRef.current = new Map();
      setDismissedKeys(new Map());
      setPrefsHydrated(false);
      return;
    }
    let cancelled = false;
    const request = createRequestSignal(undefined, 8_000);
    setPrefsHydrated(false);
    void (async () => {
      const entries = await AsyncStorage.multiGet([
        storageKey(KEYS.cleared, userId),
        storageKey(KEYS.opened, userId),
        storageKey(KEYS.dismissed, userId),
      ]);
      const localCleared = entries[0][1] || null;
      const localOpened = entries[1][1] || null;
      const localDismissed = parseDismissed(entries[2][1]);
      try {
        const { data, error } = await supabase
          .rpc('get_notification_center_bootstrap', {
            p_local_cleared_at: localCleared,
            p_local_last_opened_at: localOpened,
            p_local_dismissals: Object.fromEntries(localDismissed),
            p_limit: 200,
          })
          .abortSignal(request.signal);
        if (error) throw error;
        if (cancelled) return;
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
        setClearedAt(mergedCleared);
        setLastOpenedAt(mergedOpened);
        dismissedRef.current = mergedDismissed;
        setDismissedKeys(mergedDismissed);
        setPrefsHydrated(true);
        void AsyncStorage.multiSet([
          [storageKey(KEYS.cleared, userId), mergedCleared ?? ''],
          [storageKey(KEYS.opened, userId), mergedOpened ?? ''],
          [storageKey(KEYS.dismissed, userId), serializeDismissed(mergedDismissed)],
        ]);
      } catch {
        if (cancelled) return;
        setClearedAt(localCleared);
        setLastOpenedAt(localOpened);
        dismissedRef.current = localDismissed;
        setDismissedKeys(localDismissed);
        setPrefsHydrated(true);
      } finally {
        request.cleanup();
      }
    })().catch(() => {
      if (!cancelled) setPrefsHydrated(true);
    });
    return () => {
      cancelled = true;
      request.cancel(new Error('Notification bootstrap unmounted'));
    };
  }, [queryClient, userId]);

  const sinceIso = useMemo(() => lowerSinceIso(clearedAt), [clearedAt]);
  const snapshot = useQuery({
    queryKey: [NOTIFICATION_CENTER_PREFIX, 'snapshot', userId, sinceIso],
    queryFn: async ({ signal }): Promise<NotificationCenterItem[]> => {
      const request = createRequestSignal(signal);
      try {
        const { data, error } = await supabase
          .rpc('get_notification_center_snapshot', {
            p_since: sinceIso,
            p_limit: 200,
          })
          .abortSignal(request.signal);
        if (error) throw error;
        return (data ?? []) as unknown as NotificationCenterItem[];
      } finally {
        request.cleanup();
      }
    },
    enabled: Boolean(userId && prefsHydrated),
    staleTime: 15_000,
    placeholderData: (previous) => previous,
  });

  const items = useMemo(
    () =>
      groupNotificationItems(snapshot.data ?? [])
        .filter((item) => isNotificationVisible(item, clearedAt, dismissedKeys)),
    [clearedAt, dismissedKeys, snapshot.data],
  );
  const unreadCount = useMemo(() => {
    const openedMs = lastOpenedAt ? parseDate(lastOpenedAt).getTime() : 0;
    return items.filter((item) => parseDate(item.sortAt).getTime() > openedMs).length;
  }, [items, lastOpenedAt]);

  const markBellOpened = useCallback(async () => {
    if (!userId) return;
    const optimisticAt = new Date().toISOString();
    const previous = lastOpenedAt;
    setLastOpenedAt(optimisticAt);
    const { data, error } = await executeCommand('mark_notification_center_opened', {
      p_opened_at: optimisticAt,
    });
    if (error) {
      setLastOpenedAt(previous);
      return;
    }
    const openedAt = commandTimestamp(data, 'last_opened_at', optimisticAt);
    setLastOpenedAt(openedAt);
    await AsyncStorage.setItem(storageKey(KEYS.opened, userId), openedAt);
    if (Platform.OS !== 'web') {
      try {
        await (await import('expo-notifications')).setBadgeCountAsync(0);
      } catch {
        /* unsupported */
      }
    }
  }, [lastOpenedAt, userId]);

  const dismissItem = useCallback(
    async (key: string) => {
      if (!userId) return;
      const at = new Date().toISOString();
      const previous = new Map(dismissedRef.current);
      const next = new Map(dismissedRef.current).set(key, at);
      dismissedRef.current = next;
      setDismissedKeys(next);
      const { data, error } = await executeCommand('dismiss_notification', {
        p_notification_key: key,
        p_dismissed_at: at,
      });
      if (error) {
        dismissedRef.current = previous;
        setDismissedKeys(previous);
        throw error;
      }
      const dismissedAt = commandTimestamp(data, 'dismissed_at', at);
      const confirmed = new Map(next).set(key, dismissedAt);
      dismissedRef.current = confirmed;
      setDismissedKeys(confirmed);
      void AsyncStorage.setItem(
        storageKey(KEYS.dismissed, userId),
        serializeDismissed(confirmed),
      );
    },
    [userId],
  );

  const clearNotificationHistory = useCallback(async () => {
    if (!userId || clearingRef.current) return;
    const iso = new Date().toISOString();
    const previousCleared = clearedAt;
    const previousDismissed = new Map(dismissedRef.current);
    clearingRef.current = true;
    setIsClearing(true);
    setClearedAt(iso);
    dismissedRef.current = new Map();
    setDismissedKeys(new Map());
    try {
      const { data, error } = await executeCommand('clear_notification_history', {
        p_cleared_at: iso,
      });
      if (error) throw error;
      const confirmedAt = commandTimestamp(data, 'cleared_at', iso);
      setClearedAt(confirmedAt);
      void AsyncStorage.multiSet([
        [storageKey(KEYS.cleared, userId), confirmedAt],
        [storageKey(KEYS.dismissed, userId), serializeDismissed(new Map())],
      ]);
    } catch (error) {
      setClearedAt(previousCleared);
      dismissedRef.current = previousDismissed;
      setDismissedKeys(previousDismissed);
      throw error;
    } finally {
      clearingRef.current = false;
      setIsClearing(false);
    }
  }, [clearedAt, userId]);

  return {
    items,
    unreadCount,
    badgeCount: unreadCount,
    isLoading: !prefsHydrated || snapshot.isLoading,
    isClearing,
    markBellOpened,
    dismissItem,
    clearNotificationHistory,
    prefsHydrated,
  };
}
