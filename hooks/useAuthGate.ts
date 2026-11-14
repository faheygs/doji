import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '../stores/useAuthStore';
import { getAuthGate } from '../lib/authRoute';

export function useAuthGate() {
  // Route guards observe decisions, not unrelated profile fields or token refreshes.
  return useAuthStore(useShallow((s) => getAuthGate(
    s.isLoading, s.isProfileLoading, s.session, s.profile, s.profileLoadState,
  )));
}
