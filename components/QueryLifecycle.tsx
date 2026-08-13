import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../stores/useAuthStore';
import { reconcileAppQueries } from '../lib/reconcileQueries';

/** Connect React Query's web assumptions to the native app lifecycle. */
export function QueryLifecycle() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.session?.user?.id);
  const isAdmin = useAuthStore((state) => state.profile?.is_admin === true);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    focusManager.setFocused(AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', (state) => {
      const active = state === 'active';
      focusManager.setFocused(active);
      if (active) {
        if (userId) void useAuthStore.getState().fetchProfile(userId);
        void reconcileAppQueries(queryClient, { userId, isAdmin });
      }
    });
    return () => subscription.remove();
  }, [isAdmin, queryClient, userId]);

  return null;
}
