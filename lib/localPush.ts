import { Platform } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import {
  mergeNotificationPreferences,
  wantsCategoryEnabled,
  type NotificationPreferenceKind,
} from './notificationPreferences';

/** Fire-and-forget local notification when permission already granted (native only). */
export function scheduleLocalNotificationIfAllowed(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  preferenceKind?: NotificationPreferenceKind | 'follow_accepted',
): void {
  if (Platform.OS === 'web') return;

  void (async () => {
    try {
      const profile = useAuthStore.getState().profile;
      const prefs = mergeNotificationPreferences(profile?.notification_preferences);
      if (preferenceKind && !wantsCategoryEnabled(prefs, preferenceKind)) return;

      const Notifications = await import('expo-notifications');
      const { status } = await Notifications.getPermissionsAsync();
      if (status !== 'granted') return;
      await Notifications.scheduleNotificationAsync({
        content: { title, body, data: data ?? {} },
        trigger: { type: 'timeInterval', seconds: 1, repeats: false } as any,
      });
    } catch {
      /* ignore */
    }
  })();
}
