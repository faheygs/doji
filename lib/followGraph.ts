import { supabase } from './supabase';

/** Accepted outgoing follows + self (viewer always sees their own posts in a friends/following feed). */
export async function getAcceptedFollowingIds(viewerId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', viewerId)
    .eq('status', 'accepted');

  if (error) throw error;
  const ids = (data ?? []).map((r: { following_id: string }) => r.following_id);
  return [...new Set([viewerId, ...ids])];
}
