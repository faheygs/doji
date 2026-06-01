import { useAuthStore } from '../stores/useAuthStore';

export function useSparksBalance(): number {
  return useAuthStore((s) => s.profile?.sparks ?? 0);
}
