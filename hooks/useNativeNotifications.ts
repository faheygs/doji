import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { notificationHrefFromData } from '../lib/notificationHref';
import { mergeNotificationPreferences } from '../lib/notificationPreferences';
import { syncPushRegistration, unregisterCurrentPushInstallation } from '../lib/pushNotifications';
import { safeReplace } from '../lib/routes';
import { useAuthStore } from '../stores/useAuthStore';
import { reportOperationalFailure } from '../lib/telemetry';

/** Owns native push presentation, endpoint registration, rotation, and deep links. */
export function useNativeNotifications(canUseApp: boolean): void {
  const router = useRouter();
  const session = useAuthStore((state) => state.session);
  const profile = useAuthStore((state) => state.profile);
  const userId = session?.user?.id;
  const profileId = profile?.id;
  const profileIsBanned = profile?.is_banned;
  const profilePushEnabled = profile?.notification_preferences?.push_enabled;

  useEffect(() => {
    if (Platform.OS === 'web') return;
    void import('expo-notifications').then((Notifications) => {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          // Foreground activity belongs in the in-app bell. Background and
          // terminated delivery still use the native OS presentation.
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: false,
          shouldShowList: false,
        }),
      });
    });
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !userId || profileId !== userId) return;
    let disposed = false;

    async function syncPushEndpoint() {
      try {
        const activeProfile = useAuthStore.getState().profile;
        const enabled =
          activeProfile?.is_banned !== true &&
          mergeNotificationPreferences(activeProfile?.notification_preferences).push_enabled;
        if (!enabled) {
          await unregisterCurrentPushInstallation();
          const current = useAuthStore.getState().profile;
          if (!disposed && current) {
            useAuthStore.getState().setProfile({ ...current, notification_token: null });
          }
          return;
        }
        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.getPermissionsAsync();
        if (!disposed && status === 'granted') await syncPushRegistration(userId);
      } catch (error) {
        if (__DEV__) console.warn('[pushToken] sync failed', error);
        reportOperationalFailure('push', 'endpoint-registration', error);
      }
    }

    void syncPushEndpoint();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPushEndpoint();
    });
    return () => {
      disposed = true;
      subscription.remove();
    };
  }, [profileId, profileIsBanned, profilePushEnabled, userId]);

  useEffect(() => {
    if (Platform.OS === 'web' || !canUseApp) return;
    let disposed = false;
    let subscription: { remove: () => void } | undefined;

    void import('expo-notifications').then((Notifications) => {
      if (disposed) return;
      void Notifications.getLastNotificationResponseAsync()
        .then(async (last) => {
          if (disposed) return;
          const href = notificationHrefFromData(last?.notification.request.content.data);
          if (href) {
            safeReplace(router, href);
            await Notifications.clearLastNotificationResponseAsync();
          }
        })
        .catch(() => undefined);
      subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        const href = notificationHrefFromData(response.notification.request.content.data);
        if (href) safeReplace(router, href);
      });
    });

    return () => {
      disposed = true;
      subscription?.remove();
    };
  }, [canUseApp, router]);
}
