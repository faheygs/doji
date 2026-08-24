import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { newCommandId } from './idempotency';
import { executeCommand } from './commandGateway';
import { useAuthStore } from '../stores/useAuthStore';

const INSTALLATION_KEY = '@doji/push-installation-id';

export type PushPermissionResult = 'granted' | 'denied' | 'undetermined' | 'unsupported';

async function installationId(): Promise<string> {
  const existing = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (existing) return existing;
  const created = newCommandId('installation');
  await AsyncStorage.setItem(INSTALLATION_KEY, created);
  return created;
}

function pushEnvironment(): 'sandbox' | 'production' {
  return process.env.EXPO_PUBLIC_APP_ENV === 'production' ? 'production' : 'sandbox';
}

/** Register both the native scale endpoint and the Expo migration fallback. */
export async function syncPushRegistration(userId?: string): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  const uid = userId ?? useAuthStore.getState().session?.user?.id;
  if (!uid) return false;

  const Notifications = await import('expo-notifications');
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const [native, expo] = await Promise.all([
    Notifications.getDevicePushTokenAsync(),
    Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined),
  ]);
  const nativeToken = typeof native.data === 'string' ? native.data : JSON.stringify(native.data);
  if (!nativeToken || !expo.data) return false;

  const { error } = await executeCommand('register_native_push_endpoint', {
    p_installation_id: await installationId(),
    p_token: nativeToken,
    p_platform: Platform.OS,
    p_environment: pushEnvironment(),
    p_expo_token: expo.data,
  });
  if (error) throw error;

  const profile = useAuthStore.getState().profile;
  if (profile?.id === uid && profile.notification_token !== expo.data) {
    useAuthStore.getState().setProfile({ ...profile, notification_token: expo.data });
  }
  return true;
}

export async function unregisterCurrentPushInstallation(): Promise<void> {
  if (Platform.OS === 'web') return;
  const id = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (!id) return;
  const expoToken = useAuthStore.getState().profile?.notification_token ?? null;
  const { error } = await executeCommand('unregister_push_installation', {
    p_installation_id: id,
    p_expo_token: expoToken,
  });
  if (error) throw error;
}

/** Request OS permission, then persist native and Expo endpoint identities. */
export async function requestPushPermissionAndRegisterToken(
  userId?: string,
): Promise<PushPermissionResult> {
  if (Platform.OS === 'web') return 'unsupported';

  try {
    const Notifications = await import('expo-notifications');
    const { status: existing } = await Notifications.getPermissionsAsync();
    const { status } = existing === 'granted'
      ? { status: existing }
      : await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      return status === 'undetermined' ? 'undetermined' : 'denied';
    }
    await syncPushRegistration(userId);
    return 'granted';
  } catch {
    return 'denied';
  }
}
