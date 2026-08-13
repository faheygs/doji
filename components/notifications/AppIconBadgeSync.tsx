import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { useAuthStore } from '../../stores/useAuthStore';
import { useNotificationCenterContext } from '../../contexts/NotificationCenterContext';

/**
 * Keeps the iOS / Android launcher icon badge in sync with the in-app notification bell count
 * (same rules as {@link useNotificationCenter} `unreadCount`: items newer than last bell open).
 */
export function AppIconBadgeSync() {
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { badgeCount, prefsHydrated } = useNotificationCenterContext();

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
