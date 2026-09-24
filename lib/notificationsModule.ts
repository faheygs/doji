/** Keep the native notifications module lazy so web and cold JS startup do not load it. */
export function loadNotificationsModule(): Promise<typeof import('expo-notifications')> {
  return import('expo-notifications');
}
