import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { useAuthStore } from '../stores/useAuthStore';

export type PushPermissionResult = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/** Request OS notification permission and persist Expo push token when granted. */
export async function requestPushPermissionAndRegisterToken(
  userId?: string,
): Promise<PushPermissionResult> {
  if (Platform.OS === 'web') return 'unsupported';

  try {
    const Notifications = await import('expo-notifications');
    const { status: existing } = await Notifications.getPermissionsAsync();
    const { status } =
      existing === 'granted'
        ? { status: existing }
        : await Notifications.requestPermissionsAsync();

    if (status !== 'granted') {
      return status === 'undetermined' ? 'undetermined' : 'denied';
    }

    const uid = userId ?? useAuthStore.getState().session?.user?.id;
    if (!uid) return 'granted';

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token =
      tokenRes && typeof tokenRes === 'object' && 'data' in tokenRes
        ? (tokenRes as { data: string }).data
        : String(tokenRes);

    if (token) {
      const { error } = await supabase.rpc('register_push_token', { p_token: token });
      if (error) throw error;
      const current = useAuthStore.getState().profile;
      if (current?.id === uid) {
        useAuthStore.getState().setProfile({ ...current, notification_token: token });
      }
    }

    return 'granted';
  } catch {
    return 'denied';
  }
}
