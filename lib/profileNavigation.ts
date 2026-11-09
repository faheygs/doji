import type { Href } from 'expo-router';
import { useAuthStore } from '../stores/useAuthStore';
import { useProfileNavigationStore } from '../stores/useProfileNavigationStore';
import { hrefWithReturnTo, ROUTES } from './navigationReturn';
import type { QueryClient } from '@tanstack/react-query';
import { memberProfileOptions } from './memberProfileQueries';

export function normalizeProfileUsername(value: string | null | undefined): string {
  return value?.trim().toLowerCase().replace(/^@/, '') ?? '';
}

/** Prepare a profile route and hide any previously mounted member before navigation. */
export function prepareProfileHref(
  username: string | null | undefined,
  returnTo: string,
  client?: QueryClient,
): Href | null {
  const handle = normalizeProfileUsername(username);
  if (!handle) return null;
  const ownHandle = normalizeProfileUsername(useAuthStore.getState().profile?.username);
  if (handle === ownHandle) {
    useProfileNavigationStore.getState().clear();
    return ROUTES.profile;
  }
  useProfileNavigationStore.getState().begin(handle);
  const userId = useAuthStore.getState().session?.user.id;
  if (client && userId) void client.prefetchQuery(memberProfileOptions(handle, userId, client));
  return hrefWithReturnTo(`/(app)/member/${encodeURIComponent(handle)}`, returnTo);
}
