import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { INSTALLATION_KEY, REGISTRATION_RECEIPT_KEY, installationId, readRegistrationReceipt, persistRegistrationReceipt } from './pushRegistrationStorage';
import { executeCommand, type CommandError } from './commandGateway';
import { useAuthStore } from '../stores/useAuthStore';
import { recordOperationalFailure, reportOperationalFailure } from './telemetry';
import { mobileReleaseIdentity } from './releaseIdentity';
import {
  canReusePushRegistration,
  pushRegistrationFingerprint,
} from './pushRegistrationPolicy';
import { loadNotificationsModule } from './notificationsModule';
import { createPushRegistrationScope } from './pushRegistrationScope';
import { awaitRegistration, checkRegistrationSignal, isPushRegistrationInterrupted } from './pushRegistrationCancellation';
import { recordDiagnosticOutcome } from './mobileDiagnosticContext';
import { hasPendingPushRegistrationIncident, reportPushRegistrationRecovery } from './pushRegistrationRecovery';

export const ANDROID_NOTIFICATION_CHANNEL_ID = 'direct-activity';
let registrationGeneration = 0;
let endpointMutationTail: Promise<void> = Promise.resolve();
const activeRegistrations = new Map<
  string,
  { generation: number; promise: Promise<boolean>; scope: ReturnType<typeof createPushRegistrationScope> }
>();

export type PushPermissionResult = 'granted' | 'denied' | 'undetermined' | 'unsupported' | 'error' | 'deferred';

function pushEnvironment(): 'sandbox' | 'production' {
  return process.env.EXPO_PUBLIC_APP_ENV === 'production' ? 'production' : 'sandbox';
}

function enqueueEndpointMutation<T>(operation: () => Promise<T>): Promise<T> {
  const result = endpointMutationTail.catch(() => undefined).then(operation);
  endpointMutationTail = result.then(() => undefined, () => undefined);
  return result;
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
export async function syncPushRegistration(userId?: string, options: { signal?: AbortSignal; allowDisabled?: boolean } = {}): Promise<boolean> {
  const platform = Platform.OS;
  if (platform !== 'ios' && platform !== 'android') return false;
  const uid = userId ?? useAuthStore.getState().session?.user?.id;
  if (!uid) return false;

  const generation = registrationGeneration;
  const current = activeRegistrations.get(uid);
  if (options.signal?.aborted) return false;
  if (current?.generation === generation && current.scope.check()) return current.promise;
  const scope = createPushRegistrationScope(uid, options.signal, options.allowDisabled);
  const check = () => { scope.check(); checkRegistrationSignal(scope.signal); };
  const observe = <T>(work: PromiseLike<T>) => awaitRegistration(work, scope.signal);
  const account = { expectedUserId: uid,
    isCurrent: () => generation === registrationGeneration && useAuthStore.getState().session?.user?.id === uid,
    registrationSignal: scope.signal };

  const promise = enqueueEndpointMutation(async () => {
    check();
    if (generation !== registrationGeneration) return false;
    const Notifications = await observe(loadNotificationsModule());
    check();
    await observe(ensureAndroidNotificationChannel());
    check();
    const permission = await observe(Notifications.getPermissionsAsync());
    check();
    if (permission.status !== 'granted' || generation !== registrationGeneration) return false;

    const projectId = Constants.expoConfig?.extra?.eas?.projectId;
    const native = await observe(Notifications.getDevicePushTokenAsync());
    check();
    const nativeToken = typeof native.data === 'string' ? native.data : JSON.stringify(native.data);
    if (!nativeToken) throw new Error('The phone did not return a native push token');

    let expoToken: string | null = null;
    try {
      const expo = await observe(Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined));
      check();
      expoToken = expo.data?.trim() || null;
    } catch (error) {
      if (isPushRegistrationInterrupted(error)) throw error;
      // Native APNs/FCM is the production path. Preserve it and record that the
      // migration fallback could not be refreshed on this attempt.
      recordOperationalFailure('push', 'expo-token-fallback', error);
    }
    if (generation !== registrationGeneration) return false;

    check();
    // Storage is serialized through the endpoint queue; never leave an installation-ID write racing the next run.
    const id = await installationId();
    check();
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
    const receipt = await readRegistrationReceipt();
    check();
    if (!hasPendingPushRegistrationIncident() && canReusePushRegistration(receipt, fingerprint)) {
      updateProfileExpoToken(uid, expoToken);
      return true;
    }

    const v3Result = await executeCommand('register_native_push_endpoint_v3', {
      ...registration,
      p_notification_contract_version: 2,
      p_app_version: release.appVersion,
      p_native_build_number: release.nativeBuildNumber,
      p_release_channel: release.releaseChannel,
    }, account);
    let registrationData: boolean | null = v3Result.data;
    let registrationError: CommandError | null = v3Result.error;
    // Do not relabel a real HTTP failure just because a lifecycle transition followed it.
    if (registrationError && !['DOJI_COMMAND_404', 'PGRST202'].includes(registrationError.code)) throw registrationError;
    check();
    if (
      registrationError?.code === 'DOJI_COMMAND_404' ||
      registrationError?.code === 'PGRST202'
    ) {
      const v2Result = await executeCommand('register_native_push_endpoint_v2', {
        ...registration,
        p_notification_contract_version: 2,
      }, account);
      registrationData = v2Result.data;
      registrationError = v2Result.error;
      if (registrationError && !['DOJI_COMMAND_404', 'PGRST202'].includes(registrationError.code)) throw registrationError;
      check();
    }
    if (
      registrationError?.code === 'DOJI_COMMAND_404' ||
      registrationError?.code === 'PGRST202'
    ) {
      const v1Result = await executeCommand('register_native_push_endpoint', registration, account);
      registrationData = v1Result.data;
      registrationError = v1Result.error;
    }
    if (registrationError) throw registrationError;
    check();
    if (registrationData !== true) throw new Error('Push endpoint registration was not confirmed');
    if (generation !== registrationGeneration) return false;

    await persistRegistrationReceipt(fingerprint);
    check();
    reportPushRegistrationRecovery();
    updateProfileExpoToken(uid, expoToken);
    return true;
  }).catch(error => {
    if (!isPushRegistrationInterrupted(error)) throw error;
    recordDiagnosticOutcome('register_native_push_endpoint_v3', 'cancelled', 0);
    recordOperationalFailure('push', 'endpoint-registration-deferred', error);
    return false;
  });

  activeRegistrations.set(uid, { generation, promise, scope });
  void promise.finally(() => {
    scope.dispose();
    if (activeRegistrations.get(uid)?.promise === promise) activeRegistrations.delete(uid);
  }).catch(() => undefined);
  return promise;
}

export async function unregisterCurrentPushInstallation(): Promise<void> {
  if (Platform.OS === 'web') return;
  registrationGeneration += 1;
  for (const active of activeRegistrations.values()) active.scope.cancel();
  await enqueueEndpointMutation(async () => {
    await AsyncStorage.removeItem(REGISTRATION_RECEIPT_KEY).catch(() => undefined);
    const id = await AsyncStorage.getItem(INSTALLATION_KEY);
    if (!id) return;
    const expoToken = useAuthStore.getState().profile?.notification_token ?? null;
    const { error } = await executeCommand('unregister_push_installation', {
      p_installation_id: id,
      p_expo_token: expoToken,
    });
    if (error) throw error;
  });
}

/** Request OS permission, then persist native and Expo endpoint identities. */
export async function requestPushPermissionAndRegisterToken(
  userId?: string,
): Promise<PushPermissionResult> {
  if (Platform.OS === 'web') return 'unsupported';
  const uid = userId ?? useAuthStore.getState().session?.user?.id;
  if (!uid) return 'deferred';

  try {
    const Notifications = await loadNotificationsModule();
    await ensureAndroidNotificationChannel();
    const { status: existing } = await Notifications.getPermissionsAsync();
    const { status } =
      existing === 'granted' ? { status: existing } : await Notifications.requestPermissionsAsync();
    if (status !== 'granted') {
      return status === 'undetermined' ? 'undetermined' : 'denied';
    }
    const registered = await syncPushRegistration(uid, { allowDisabled: true });
    return registered ? 'granted' : 'deferred';
  } catch (error) {
    // Permission denial and endpoint-registration failure are different states.
    // Reporting a transport/configuration failure as "denied" hides a broken
    // production push path and gives the user incorrect remediation.
    reportOperationalFailure('push', 'permission-or-registration', error);
    return 'error';
  }
}
