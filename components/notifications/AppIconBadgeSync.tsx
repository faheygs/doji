import React, { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../stores/useAuthStore';
import { useNotificationCenter, NOTIFICATION_CENTER_PREFIX } from '../../hooks/useNotificationCenter';

/**
 * Keeps the iOS / Android launcher icon badge in sync with the in-app notification bell count
 * (same rules as {@link useNotificationCenter} `unreadCount`: items newer than last bell open).
 */
export function AppIconBadgeSync() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const queryClient = useQueryClient();
  const { badgeCount, prefsHydrated } = useNotificationCenter();

  useEffect(() => {
    if (Platform.OS === 'web') return;

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      if (userId) {
        void queryClient.invalidateQueries({
          predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === NOTIFICATION_CENTER_PREFIX,
        });
      } else {
        // Logged-out foreground: clear badge immediately without waiting for queries.
        void import('expo-notifications').then((N) =>
          N.setBadgeCountAsync(0).catch(() => {}),
        );
      }
    });
    return () => sub.remove();
  }, [userId, queryClient]);

  useEffect(() => {
    if (Platform.OS === 'web') return;

    let cancelled = false;
    void import('expo-notifications').then((Notifications) => {
      if (cancelled) return;
      (async () => {
        try {
          if (!userId) {
            await Notifications.setBadgeCountAsync(0);
            return;
          }
          if (!prefsHydrated) return;
          await Notifications.setBadgeCountAsync(Math.max(0, badgeCount));
        } catch {
          /* simulator / unsupported */
        }
      })();
    });
    return () => {
      cancelled = true;
    };
  }, [userId, prefsHydrated, badgeCount]);

  return null;
}
