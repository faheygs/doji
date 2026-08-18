import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { NotificationCenterState, NotificationDismissal } from '../types/database';
import type { NotificationCenterItem } from '../lib/notificationCenterTypes';
import { parseDate } from '../utils/time';
import { createRequestSignal } from '../lib/requestSignal';
import { isNotificationVisible } from '../lib/notificationVisibility';

export type { NotificationCenterItem } from '../lib/notificationCenterTypes';
export const NOTIFICATION_CENTER_PREFIX = 'notificationCenter' as const;
const HISTORY_DAYS = 30;
const KEYS = {
  cleared: '@doit/bell-cleared-at',
  opened: '@doit/bell-last-opened',
  dismissed: '@doit/dismissed-notif-keys',
};
type Dismissed = Map<string, string>;
const storageKey = (key: string, uid?: string) => (uid ? `${key}:${uid}` : key);

function latestIso(a: string | null, b: string | null) {
  if (!a) return b;
  if (!b) return a;
  return parseDate(a).getTime() >= parseDate(b).getTime() ? a : b;
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
    /* ignore invalid legacy state */
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
  return new Date(Math.max(clearedMs, Date.now() - HISTORY_DAYS * 86_400_000)).toISOString();
}

export function useNotificationCenter(_options: { deferInitialLoad?: boolean } = {}) {
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
    setPrefsHydrated(false);
    const horizon = new Date(Date.now() - HISTORY_DAYS * 86_400_000).toISOString();
    void Promise.all([
      AsyncStorage.multiGet([
        storageKey(KEYS.cleared, userId),
        storageKey(KEYS.opened, userId),
        storageKey(KEYS.dismissed, userId),
      ]),
      supabase
        .from('notification_center_state')
        .select('user_id, cleared_at, last_opened_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .from('notification_dismissals')
        .select('user_id, notification_key, dismissed_at')
        .eq('user_id', userId)
        .gte('dismissed_at', horizon)
        .order('dismissed_at', { ascending: false })
        .limit(2000),
    ])
      .then(([entries, stateResult, dismissalsResult]) => {
        if (cancelled) return;
        const remote = stateResult.data as NotificationCenterState | null;
        const mergedCleared = latestIso(entries[0][1], remote?.cleared_at ?? null);
        const mergedOpened = latestIso(entries[1][1], remote?.last_opened_at ?? null);
        const mergedDismissed = mergeDismissed(
          parseDismissed(entries[2][1]),
          (dismissalsResult.data ?? []) as NotificationDismissal[],
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
        void supabase.rpc('sync_notification_center_state', {
          p_cleared_at: mergedCleared,
          p_last_opened_at: mergedOpened,
          p_dismissals: Object.fromEntries(mergedDismissed),
        });
      })
      .catch(() => {
        if (!cancelled) setPrefsHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
      (snapshot.data ?? []).filter((item) => isNotificationVisible(item, clearedAt, dismissedKeys)),
    [clearedAt, dismissedKeys, snapshot.data],
  );
  const unreadCount = useMemo(() => {
    const openedMs = lastOpenedAt ? parseDate(lastOpenedAt).getTime() : 0;
    return items.filter((item) => parseDate(item.sortAt).getTime() > openedMs).length;
  }, [items, lastOpenedAt]);

  const markBellOpened = useCallback(async () => {
    if (!userId) return;
    const iso = new Date().toISOString();
    setLastOpenedAt(iso);
    await Promise.all([
      AsyncStorage.setItem(storageKey(KEYS.opened, userId), iso),
      supabase.rpc('mark_notification_center_opened', { p_opened_at: iso }),
    ]);
    if (Platform.OS !== 'web') {
      try {
        await (await import('expo-notifications')).setBadgeCountAsync(0);
      } catch {
        /* unsupported */
      }
    }
  }, [userId]);

  const dismissItem = useCallback(
    async (key: string) => {
      if (!userId) return;
      const at = new Date().toISOString();
      const previous = new Map(dismissedRef.current);
      const next = new Map(dismissedRef.current).set(key, at);
      dismissedRef.current = next;
      setDismissedKeys(next);
      const { error } = await supabase.rpc('dismiss_notification', {
        p_notification_key: key,
        p_dismissed_at: at,
      });
      if (error) {
        dismissedRef.current = previous;
        setDismissedKeys(previous);
        throw error;
      }
      void AsyncStorage.setItem(storageKey(KEYS.dismissed, userId), serializeDismissed(next));
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
      const { error } = await supabase.rpc('clear_notification_history', { p_cleared_at: iso });
      if (error) throw error;
      void AsyncStorage.multiSet([
        [storageKey(KEYS.cleared, userId), iso],
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
