import { supabase } from './supabase';

/** Accepted mutual friend user ids for the viewer (does not include self). */
export async function getAcceptedFriendIds(viewerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`);

  if (error) throw error;

  const ids = new Set<string>();
  for (const row of data ?? []) {
    const other =
      row.requester_id === viewerId
        ? (row.addressee_id as string)
        : (row.requester_id as string);
    if (other && other !== viewerId) ids.add(other);
  }
  return [...ids];
}

/** Friend ids including the viewer (for feed audience filtering). */
export async function getFriendIdsIncludingSelf(viewerId: string): Promise<string[]> {
  const friends = await getAcceptedFriendIds(viewerId);
  return [...new Set([viewerId, ...friends])];
}
