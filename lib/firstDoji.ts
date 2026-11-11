import { supabase } from './supabase';
import { runMemberRead } from './runMemberRead';
import type { FeedAudience } from './feedAudience';

export type FirstDoji = {
  daily_event_id: string;
  audience: FeedAudience;
  completed_at: string;
  profile: {
    id: string;
    username: string;
    display_name: string | null;
    avatar_url: string | null;
    equipped_border_key: string | null;
  };
};

/** Only isolated Dev/Staging builds may use this qualified Staging backend. */
export function firstDojiEnabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_APP_ENV === 'staging' &&
    (process.env.EXPO_PUBLIC_RELEASE_CHANNEL === 'development' ||
      process.env.EXPO_PUBLIC_RELEASE_CHANNEL === 'staging') &&
    process.env.EXPO_PUBLIC_SUPABASE_URL === 'https://ohrcupagdoilkwhecict.supabase.co'
  );
}

export async function readFirstDoji(
  eventId: string,
  audience: FeedAudience,
  signal: AbortSignal,
): Promise<FirstDoji | null> {
  const { data } = await runMemberRead(
    supabase.rpc('get_first_doji_v1', {
      p_daily_event_id: eventId,
      p_audience: audience,
    }),
    signal,
  );
  if (data === null) return null;
  const row = data as FirstDoji;
  const nullableText = (value: unknown) => value === null || typeof value === 'string';
  if (
    !row ||
    row.daily_event_id !== eventId ||
    row.audience !== audience ||
    !Number.isFinite(Date.parse(row.completed_at)) ||
    !row.profile ||
    typeof row.profile.id !== 'string' ||
    !row.profile.id ||
    typeof row.profile.username !== 'string' ||
    !row.profile.username ||
    !nullableText(row.profile.display_name) ||
    !nullableText(row.profile.avatar_url) ||
    !nullableText(row.profile.equipped_border_key)
  )
    throw new Error('Invalid first Doji response');
  return row;
}
