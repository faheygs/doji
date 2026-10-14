import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/useAuthStore';
import { createNativeReadLifecycle, type NativeNetworkState } from '../lib/nativeReadLifecycle';

/** Connect React Query's web assumptions to the native app lifecycle. */
export function QueryLifecycle() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user?.id);
  const isAdmin = useAuthStore((state) => state.profile?.is_admin === true);
  const isBanned = useAuthStore((state) => state.profile?.is_banned === true);
  const lastNetwork = useRef<NativeNetworkState | undefined>(undefined);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const lifecycle = createNativeReadLifecycle(queryClient, {
      active: AppState.currentState === 'active', userId, isAdmin, isBanned,
      network: lastNetwork.current,
      isCurrent: () => useAuthStore.getState().session?.user?.id === userId,
      refreshProfile: () => {
        if (userId && useAuthStore.getState().session?.user?.id === userId) {
          void useAuthStore.getState().fetchProfile(userId);
        }
      },
    });
    let network: typeof import('expo-network') | undefined;
    try { network = require('expo-network'); } catch { /* Older native binary: retain bounded reads. */ }
    let alive = true;
    let revision = 0;
    const snapshot = () => {
      const requested = ++revision;
      try {
        void network?.getNetworkStateAsync().then(state => {
          if (alive && revision === requested) {
            lastNetwork.current = state;
            lifecycle.network(state);
          }
        }).catch(() => {});
      } catch { /* Unknown connectivity is not proof of an outage. */ }
    };
    let networkSubscription: { remove: () => void } | undefined;
    try {
      networkSubscription = network?.addNetworkStateListener(state => {
        if (!alive) return;
        revision += 1;
        lastNetwork.current = state;
        lifecycle.network(state);
      });
    } catch { /* Optional on older native binaries. */ }
    const subscription = AppState.addEventListener('change', (state) => {
      lifecycle.appState(state);
      if (state === 'active') snapshot();
    });
    snapshot();
    return () => {
      alive = false;
      revision += 1;
      lifecycle.dispose();
      subscription.remove();
      networkSubscription?.remove();
    };
  }, [isAdmin, isBanned, queryClient, userId]);

  return null;
}
