import type { Href } from 'expo-router';
import { useAuthStore } from '../stores/useAuthStore';
import { useProfileNavigationStore } from '../stores/useProfileNavigationStore';
import { hrefWithReturnTo, ROUTES } from './navigationReturn';

export function normalizeProfileUsername(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/^@/, '') ?? '';
}

/** Prepare a profile route and hide any previously mounted member before navigation. */
export function prepareProfileHref(
  username: string | null | undefined,
  returnTo: string,
): Href | null {
  const handle = normalizeProfileUsername(username);
  if (!handle) return null;
  const ownHandle = normalizeProfileUsername(useAuthStore.getState().profile?.username);
  if (handle === ownHandle) {
    useProfileNavigationStore.getState().clear();
    return ROUTES.profile;
  }
  useProfileNavigationStore.getState().begin(handle);
  return hrefWithReturnTo(`/(app)/member/${encodeURIComponent(handle)}`, returnTo);
}
