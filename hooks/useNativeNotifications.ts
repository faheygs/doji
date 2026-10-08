import { useEffect, useRef, useState } from 'react';
import { AppState, InteractionManager, Platform } from 'react-native';
import { useRootNavigationState, useRouter } from 'expo-router';
import type { NotificationResponse } from 'expo-notifications';
import { notificationHrefFromData } from '../lib/notificationHref';
import { mergeNotificationPreferences } from '../lib/notificationPreferences';
import { syncPushRegistration, unregisterCurrentPushInstallation } from '../lib/pushNotifications';
import { safePush } from '../lib/routes';
import { useAuthStore } from '../stores/useAuthStore';
import { recordOperationalFailure, reportOperationalFailure } from '../lib/telemetry';
import { attentionScopeFromPushData } from '../lib/notificationAttention';
import { executeCommand } from '../lib/commandGateway';
import { retryPushRegistration } from '../lib/retryPushRegistration';
import { createPushRegistrationScope } from '../lib/pushRegistrationScope';
import { awaitRegistration, isPushRegistrationInterrupted } from '../lib/pushRegistrationCancellation';

async function markNotificationResponseSeen(data: unknown, expectedUserId: string, isCurrent: () => boolean): Promise<void> {
  const scope = attentionScopeFromPushData(data);
  if (!scope) return;
  if (!isCurrent()) return;
  const { error } = await executeCommand('mark_notification_attention_seen', {
    p_receipts: [{ ...scope, seen_at: new Date().toISOString() }],
  }, { expectedUserId, isCurrent });
  if (error) recordOperationalFailure('push', 'attention-seen-deferred', new Error('Attention acknowledgement not confirmed'));
}

function markAfterNavigationSettles(data: unknown, expectedUserId: string, isCurrent: () => boolean): void {
  InteractionManager.runAfterInteractions(() => {
    // A response is only consumed after the destination transition has mounted.
    // If the app is interrupted first, the durable attention row remains unseen.
    if (!isCurrent() || AppState.currentState !== 'active') return;
    void markNotificationResponseSeen(data, expectedUserId, isCurrent).catch(() => {
      recordOperationalFailure('push', 'attention-seen-deferred', new Error('Attention acknowledgement unavailable'));
    });
  });
}

type PendingNotificationResponse = {
  key: string;
  data: unknown;
};

function responseKey(identifier: string | undefined, data: unknown): string {
  if (data && typeof data === 'object') {
    const eventId = (data as Record<string, unknown>).eventId;
    if (typeof eventId === 'string' && eventId.length > 0) return `event:${eventId}`;
  }
  return `notification:${identifier ?? 'unknown'}`;
}

/** Owns native push presentation, endpoint registration, rotation, and deep links. */
export function useNativeNotifications(canUseApp: boolean): void {
  const router = useRouter();
  const rootNavigationState = useRootNavigationState();
  const [pendingResponse, setPendingResponse] = useState<PendingNotificationResponse | null>(null);
  const handledResponseKeysRef = useRef(new Set<string>());
  const notificationsModuleRef = useRef<typeof import('expo-notifications') | null>(null);
  const mountedRef = useRef(false);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
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
    let activeScope: ReturnType<typeof createPushRegistrationScope> | undefined;

    async function syncPushEndpoint() {
      if (disposed || (activeScope && activeScope.check())) return;
      let scope: ReturnType<typeof createPushRegistrationScope> | undefined;
      const cancelled = () => disposed || !!scope?.signal.aborted;
      try {
        const activeProfile = useAuthStore.getState().profile;
        const enabled =
          activeProfile?.is_banned !== true &&
          mergeNotificationPreferences(activeProfile?.notification_preferences).push_enabled;
        if (!enabled) {
          await unregisterCurrentPushInstallation();
          const current = useAuthStore.getState().profile;
          if (!disposed && current && current.id === userId) {
            useAuthStore.getState().setProfile({ ...current, notification_token: null });
          }
          return;
        }
        scope = createPushRegistrationScope(userId!);
        activeScope = scope;
        if (!scope.check()) return;
        const Notifications = await awaitRegistration(import('expo-notifications'), scope.signal);
        const { status } = await awaitRegistration(Notifications.getPermissionsAsync(), scope.signal);
        if (cancelled() || status !== 'granted') return;

        await retryPushRegistration(
          () => syncPushRegistration(userId, { signal: scope!.signal }),
          cancelled,
          (error, attempt) => recordOperationalFailure('push', 'endpoint-registration-retry', error, { attempt }),
          scope.signal,
        );
      } catch (error) {
        if (cancelled() || isPushRegistrationInterrupted(error)) return;
        if (__DEV__) console.warn('[pushToken] sync failed', error);
        reportOperationalFailure('push', 'endpoint-registration', error);
      } finally {
        scope?.dispose();
        if (activeScope === scope) activeScope = undefined;
      }
    }

    void syncPushEndpoint();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPushEndpoint();
    });
    return () => {
      disposed = true;
      activeScope?.cancel();
      subscription.remove();
    };
  }, [profileId, profileIsBanned, profilePushEnabled, userId]);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    let disposed = false;
    let subscription: { remove: () => void } | undefined;

    void import('expo-notifications').then((Notifications) => {
      if (disposed) return;
      notificationsModuleRef.current = Notifications;
      const queueResponse = (response: NotificationResponse | null | undefined) => {
        if (!response) return;
        const data = response.notification.request.content.data ?? {};
        const href = notificationHrefFromData(data);
        if (!href) return;
        const key = responseKey(response.notification.request.identifier, data);
        if (handledResponseKeysRef.current.has(key)) return;
        setPendingResponse((current) => current?.key === key ? current : { key, data });
      };

      // Install the live listener before reading the cold-start response so a
      // tap cannot be lost while auth/profile state is still restoring.
      subscription = Notifications.addNotificationResponseReceivedListener(queueResponse);
      void Notifications.getLastNotificationResponseAsync()
        .then((last) => {
          if (disposed) return;
          queueResponse(last);
        })
        .catch(() => undefined);
    });

    return () => {
      disposed = true;
      subscription?.remove();
    };
  }, []);

  useEffect(() => {
    if (
      Platform.OS === 'web' ||
      !canUseApp ||
      !rootNavigationState?.key ||
      !userId ||
      !pendingResponse
    ) {
      return;
    }

    // Protected app routes and the navigation container were committed in the
    // same render. Yield one task before consuming the durable response.
    const timer = setTimeout(() => {
      const href = notificationHrefFromData(pendingResponse.data);
      if (!href || !safePush(router, href)) return;
      handledResponseKeysRef.current.add(pendingResponse.key);
      setPendingResponse((current) => current?.key === pendingResponse.key ? null : current);
      markAfterNavigationSettles(pendingResponse.data, userId, () => mountedRef.current &&
        useAuthStore.getState().session?.user?.id === userId);
      void notificationsModuleRef.current?.clearLastNotificationResponseAsync().catch(() => {
        recordOperationalFailure('push', 'response-clear-deferred', new Error('Native response cleanup unavailable'));
      });
    }, 0);

    return () => clearTimeout(timer);
  }, [canUseApp, pendingResponse, rootNavigationState?.key, router, userId]);
}
