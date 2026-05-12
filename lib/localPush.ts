import { Platform } from 'react-native';

/** Fire-and-forget local notification when permission already granted (native only). */
export function scheduleLocalNotificationIfAllowed(
  title: string,
  body: string,
  data?: Record<string, unknown>,
): void {
  if (Platform.OS === 'web') return;

  void (async () => {
    try {
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
