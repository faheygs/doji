/**
 * Legacy fallback example: register an Expo push token after login.
 * Copy into your app (e.g. a hook) and adjust imports / Supabase client.
 *
 * Production Doji uses lib/pushNotifications.ts so every installation registers
 * its native APNs/FCM endpoint atomically. Do not write profile token fields directly.
 * EAS: projectId in app.config extra.eas.projectId
 */

import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';

// Configure how notifications are presented when app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function usePushRegistration(
  supabase: import('@supabase/supabase-js').SupabaseClient,
  userId: string | null,
) {
  const listenerRef = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;

    (async () => {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let finalStatus = existing;
      if (existing !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted' || cancelled) return;

      const projectId =
        Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
      if (!projectId) {
        console.warn('EAS projectId missing — cannot get Expo push token');
        return;
      }

      const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      if (cancelled) return;

      const token = tokenData.data;
      await supabase.rpc('register_push_token', { p_token: token });
    })();

    listenerRef.current = Notifications.addPushTokenListener(async (next) => {
      const token = next.data;
      await supabase.rpc('register_push_token', { p_token: token });
    });

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
    };
  }, [supabase, userId]);
}

/** Call from root layout: navigate when user taps a notification. */
export function subscribeNotificationOpen(handler: (url: string | undefined) => void) {
  Notifications.getLastNotificationResponseAsync().then((response) => {
    const url = response?.notification.request.content.data?.url as string | undefined;
    if (url) handler(url);
  });
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const url = response.notification.request.content.data?.url as string | undefined;
    if (url) handler(url);
  });
}
