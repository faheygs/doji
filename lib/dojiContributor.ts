import { supabase } from './supabase';
import { runMemberRead } from './runMemberRead';

export type DojiContributor = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  equipped_border_key: string | null;
};

export async function readDojiContributor(eventId: string, signal: AbortSignal) {
  const { data } = await runMemberRead(
    supabase.rpc('get_doji_contributor_v1', { p_daily_event_id: eventId }),
    signal,
  );
  if (data === null) return null;
  const row = data as { daily_event_id: string; profile: DojiContributor };
  const nullableText = (value: unknown) => value === null || typeof value === 'string';
  if (
    !row ||
    row.daily_event_id !== eventId ||
    !row.profile ||
    typeof row.profile.id !== 'string' ||
    !row.profile.id ||
    typeof row.profile.username !== 'string' ||
    !row.profile.username ||
    !nullableText(row.profile.display_name) ||
    !nullableText(row.profile.avatar_url) ||
    !nullableText(row.profile.equipped_border_key)
  )
    throw new Error('Invalid Doji contributor');
  // Never retain unexpected editorial or private fields in the member cache.
  const { id, username, display_name, avatar_url, equipped_border_key } = row.profile;
  return { id, username, display_name: display_name ?? username, avatar_url, equipped_border_key };
}
