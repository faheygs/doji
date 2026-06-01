import { supabase } from './supabase';

/** Accepted follows + followers + self — users eligible for @ mentions. */
export async function fetchMentionableUserIds(viewerId: string): Promise<string[]> {
  const [{ data: following, error: fErr }, { data: followers, error: rErr }] = await Promise.all([
    supabase
      .from('follows')
      .select('following_id')
      .eq('follower_id', viewerId)
      .eq('status', 'accepted'),
    supabase
      .from('follows')
      .select('follower_id')
      .eq('following_id', viewerId)
      .eq('status', 'accepted'),
  ]);

  if (fErr) throw fErr;
  if (rErr) throw rErr;

  const ids = new Set<string>([viewerId]);
  for (const row of following ?? []) {
    ids.add(row.following_id as string);
  }
  for (const row of followers ?? []) {
    ids.add(row.follower_id as string);
  }
  return [...ids];
}
