import type { Href } from 'expo-router';
import { useAuthStore } from '../stores/useAuthStore';
import { useProfileNavigationStore } from '../stores/useProfileNavigationStore';
import { hrefWithReturnTo, ROUTES } from './navigationReturn';
import type { QueryClient } from '@tanstack/react-query';
import { memberProfileOptions, warmProfileActions } from './memberProfileQueries';

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
  if (client && userId) {
    const options = memberProfileOptions(handle, userId, client);
    const cached = client.getQueryData(options.queryKey);
    // A fresh profile cache skips its queryFn: still warm stale/missing action reads.
    if (cached?.profile?.username === handle) warmProfileActions(client, userId, cached.profile.id);
    void client.prefetchQuery(options);
  }
  return hrefWithReturnTo(`/(app)/member/${encodeURIComponent(handle)}`, returnTo);
}
