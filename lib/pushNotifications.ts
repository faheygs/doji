import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { newCommandId } from './idempotency';
import { executeCommand } from './commandGateway';
import { useAuthStore } from '../stores/useAuthStore';
import { recordOperationalFailure, reportOperationalFailure } from './telemetry';
import { mobileReleaseIdentity } from './releaseIdentity';

const INSTALLATION_KEY = '@doji/push-installation-id';
export const ANDROID_NOTIFICATION_CHANNEL_ID = 'direct-activity';

export type PushPermissionResult = 'granted' | 'denied' | 'undetermined' | 'unsupported' | 'error';

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

/** Android 13+ will not grant or return a push token until a channel exists. */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = await import('expo-notifications');
  await Notifications.setNotificationChannelAsync('doji-live', {
    name: 'Doji goes live',
    description: 'Time-sensitive alerts when the daily Doji opens',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#F97316',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
    name: 'Friend requests, mentions & replies',
    description: 'Direct activity that needs your attention',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#F97316',
    sound: 'default',
  });
  await Notifications.setNotificationChannelAsync('reviews-account', {
    name: 'Reviews & account',
    description: 'Challenge review, moderation, and important account updates',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#F97316',
    sound: 'default',
  });
  // Retain the old channel so Android keeps existing user-level settings while
  // any already-accepted provider messages expire.
  await Notifications.setNotificationChannelAsync('doji-alerts', {
    name: 'Legacy Doji alerts',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: 'default',
  });
}

/**
 * Register the native scale endpoint. Expo is an optional migration fallback:
 * a temporary Expo outage must never discard a valid APNs/FCM endpoint.
 */
export async function syncPushRegistration(userId?: string): Promise<boolean> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  const uid = userId ?? useAuthStore.getState().session?.user?.id;
  if (!uid) return false;

  const Notifications = await import('expo-notifications');
  await ensureAndroidNotificationChannel();
  const permission = await Notifications.getPermissionsAsync();
  if (permission.status !== 'granted') return false;

  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  const native = await Notifications.getDevicePushTokenAsync();
  const nativeToken = typeof native.data === 'string' ? native.data : JSON.stringify(native.data);
  if (!nativeToken) throw new Error('The phone did not return a native push token');

  let expoToken: string | null = null;
  try {
    const expo = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    expoToken = expo.data?.trim() || null;
  } catch (error) {
    // Native APNs/FCM is the production path. Preserve it and record that the
    // migration fallback could not be refreshed on this attempt.
    recordOperationalFailure('push', 'expo-token-fallback', error);
  }

  const registration = {
    p_installation_id: await installationId(),
    p_token: nativeToken,
    p_platform: Platform.OS,
    p_environment: pushEnvironment(),
    p_expo_token: expoToken,
  } as const;
  const release = mobileReleaseIdentity();
  let { error } = await executeCommand('register_native_push_endpoint_v3', {
    ...registration,
    p_notification_contract_version: 2,
    p_app_version: release.appVersion,
    p_native_build_number: release.nativeBuildNumber,
    p_release_channel: release.releaseChannel,
  });
  if (error?.code === 'DOJI_COMMAND_404' || error?.code === 'PGRST202') {
    ({ error } = await executeCommand('register_native_push_endpoint_v2', {
      ...registration,
      p_notification_contract_version: 2,
    }));
  }
  if (error?.code === 'DOJI_COMMAND_404' || error?.code === 'PGRST202') {
    ({ error } = await executeCommand('register_native_push_endpoint', registration));
  }
  if (error) throw error;

  const profile = useAuthStore.getState().profile;
  if (profile?.id === uid && expoToken && profile.notification_token !== expoToken) {
    useAuthStore.getState().setProfile({ ...profile, notification_token: expoToken });
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
    await ensureAndroidNotificationChannel();
    const { status: existing } = await Notifications.getPermissionsAsync();
    const { status } =
      existing === 'granted' ? { status: existing } : await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      return status === 'undetermined' ? 'undetermined' : 'denied';
    }
    await syncPushRegistration(userId);
    return 'granted';
  } catch (error) {
    // Permission denial and endpoint-registration failure are different states.
    // Reporting a transport/configuration failure as "denied" hides a broken
    // production push path and gives the user incorrect remediation.
    reportOperationalFailure('push', 'permission-or-registration', error);
    return 'error';
  }
}
