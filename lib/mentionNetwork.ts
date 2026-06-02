import { supabase } from './supabase';

/** Accepted friends + self — users eligible for @ mentions. */
export async function fetchMentionableUserIds(viewerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${viewerId},addressee_id.eq.${viewerId}`);

  if (error) throw error;

  const ids = new Set<string>([viewerId]);
  for (const row of data ?? []) {
    const other =
      row.requester_id === viewerId
        ? (row.addressee_id as string)
        : (row.requester_id as string);
    if (other) ids.add(other);
  }
  return [...ids];
}
