import { useMemo } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { getAuthGate } from '../lib/authRoute';

export function useAuthGate() {
  const session = useAuthStore((s) => s.session);
  const profile = useAuthStore((s) => s.profile);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isProfileLoading = useAuthStore((s) => s.isProfileLoading);

  return useMemo(
    () => getAuthGate(isLoading, isProfileLoading, session, profile),
    [isLoading, isProfileLoading, session, profile],
  );
}
