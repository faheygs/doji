import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { newCommandId } from './idempotency';
import { executeCommand, type CommandError } from './commandGateway';
import { useAuthStore } from '../stores/useAuthStore';
import { recordOperationalFailure, reportOperationalFailure } from './telemetry';
import { mobileReleaseIdentity } from './releaseIdentity';
import {
  canReusePushRegistration,
  pushRegistrationFingerprint,
  type PushRegistrationReceipt,
} from './pushRegistrationPolicy';
import { loadNotificationsModule } from './notificationsModule';

const INSTALLATION_KEY = '@doji/push-installation-id';
const REGISTRATION_RECEIPT_KEY = '@doji/push-registration-receipt:v1';
export const ANDROID_NOTIFICATION_CHANNEL_ID = 'direct-activity';

let registrationGeneration = 0;
let endpointMutationTail: Promise<void> = Promise.resolve();
const activeRegistrations = new Map<
  string,
  { generation: number; promise: Promise<boolean> }
>();

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

function enqueueEndpointMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = endpointMutationTail.catch(() => undefined).then(operation);
  endpointMutationTail = result.then(() => undefined, () => undefined);
  return result;
}

async function readRegistrationReceipt(): Promise<PushRegistrationReceipt | null> {
  try {
    const raw = await AsyncStorage.getItem(REGISTRATION_RECEIPT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PushRegistrationReceipt>;
    if (typeof value.fingerprint !== 'string' || typeof value.registeredAt !== 'number') {
      throw new Error('Invalid push registration receipt');
    }
    return { fingerprint: value.fingerprint, registeredAt: value.registeredAt };
  } catch {
    void AsyncStorage.removeItem(REGISTRATION_RECEIPT_KEY);
    return null;
  }
}

async function persistRegistrationReceipt(fingerprint: string): Promise<void> {
  try {
    await AsyncStorage.setItem(
      REGISTRATION_RECEIPT_KEY,
      JSON.stringify({ fingerprint, registeredAt: Date.now() } satisfies PushRegistrationReceipt),
    );
  } catch (error) {
    // Registration already committed. Cache persistence is only a load
    // optimization and must never turn a working endpoint into a failure.
    recordOperationalFailure('push', 'registration-receipt-persist', error);
  }
}

function updateProfileExpoToken(userId: string, expoToken: string | null): void {
  if (!expoToken) return;
  const profile = useAuthStore.getState().profile;
  if (profile?.id === userId && profile.notification_token !== expoToken) {
    useAuthStore.getState().setProfile({ ...profile, notification_token: expoToken });
  }
}

/** Android 13+ will not grant or return a push token until a channel exists. */
export async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  const Notifications = await loadNotificationsModule();
  await Notifications.setNotificationChannelAsync('doji-live', {
    name: 'Doji goes live',
    description: 'Urgent alerts when the 10-minute daily Doji opens',
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
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') return false;
  const uid = userId ?? useAuthStore.getState().session?.user?.id;
  if (!uid) return false;

  const generation = registrationGeneration;
  const current = activeRegistrations.get(uid);
  if (current?.generation === generation) return current.promise;

  const promise = enqueueEndpointMutation(async () => {
    if (generation !== registrationGeneration) return false;
    const Notifications = await loadNotificationsModule();
    await ensureAndroidNotificationChannel();
    const permission = await Notifications.getPermissionsAsync();
    if (permission.status !== 'granted' || generation !== registrationGeneration) return false;

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
    if (generation !== registrationGeneration) return false;

    const id = await installationId();
    const environment = pushEnvironment();
    const registration = {
      p_installation_id: id,
      p_token: nativeToken,
      p_platform: platform,
      p_environment: environment,
      p_expo_token: expoToken,
    } as const;
    const release = mobileReleaseIdentity();
    const fingerprint = pushRegistrationFingerprint({
      installationId: id,
      userId: uid,
      nativeToken,
      expoToken,
      platform,
      environment,
      appVersion: release.appVersion,
      nativeBuildNumber: release.nativeBuildNumber,
      releaseChannel: release.releaseChannel,
      notificationContractVersion: 2,
      pushEnabled: true,
    });
    if (canReusePushRegistration(await readRegistrationReceipt(), fingerprint)) {
      updateProfileExpoToken(uid, expoToken);
      return true;
    }

    const v3Result = await executeCommand('register_native_push_endpoint_v3', {
      ...registration,
      p_notification_contract_version: 2,
      p_app_version: release.appVersion,
      p_native_build_number: release.nativeBuildNumber,
      p_release_channel: release.releaseChannel,
    });
    let registrationData: boolean | null = v3Result.data;
    let registrationError: CommandError | null = v3Result.error;
    if (
      registrationError?.code === 'DOJI_COMMAND_404' ||
      registrationError?.code === 'PGRST202'
    ) {
      const v2Result = await executeCommand('register_native_push_endpoint_v2', {
        ...registration,
        p_notification_contract_version: 2,
      });
      registrationData = v2Result.data;
      registrationError = v2Result.error;
    }
    if (
      registrationError?.code === 'DOJI_COMMAND_404' ||
      registrationError?.code === 'PGRST202'
    ) {
      const v1Result = await executeCommand('register_native_push_endpoint', registration);
      registrationData = v1Result.data;
      registrationError = v1Result.error;
    }
    if (registrationError) throw registrationError;
    if (registrationData !== true) throw new Error('Push endpoint registration was not confirmed');
    if (generation !== registrationGeneration) return false;

    await persistRegistrationReceipt(fingerprint);
    updateProfileExpoToken(uid, expoToken);
    return true;
  });

  activeRegistrations.set(uid, { generation, promise });
  void promise.finally(() => {
    if (activeRegistrations.get(uid)?.promise === promise) activeRegistrations.delete(uid);
  }).catch(() => undefined);
  return promise;
}

export async function unregisterCurrentPushInstallation(): Promise<void> {
  if (Platform.OS === 'web') return;
  registrationGeneration += 1;
  await AsyncStorage.removeItem(REGISTRATION_RECEIPT_KEY).catch(() => undefined);
  const id = await AsyncStorage.getItem(INSTALLATION_KEY);
  if (!id) return;
  const expoToken = useAuthStore.getState().profile?.notification_token ?? null;
  const { error } = await enqueueEndpointMutation(() =>
    executeCommand('unregister_push_installation', {
      p_installation_id: id,
      p_expo_token: expoToken,
    }),
  );
  if (error) throw error;
}

/** Request OS permission, then persist native and Expo endpoint identities. */
export async function requestPushPermissionAndRegisterToken(
  userId?: string,
): Promise<PushPermissionResult> {
  if (Platform.OS === 'web') return 'unsupported';

  try {
    const Notifications = await loadNotificationsModule();
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
