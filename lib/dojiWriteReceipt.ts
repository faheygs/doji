import { supabase } from './supabase';

/** Resolve an ambiguous client response without issuing a second write. */
export async function getCommittedPostReceipt(userEventId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('id, user_event_id, user_id, type, caption, photo_url, front_photo_url, video_url, is_late, selected_option_index, reaction_count, comment_count, comments_disabled, visibility, created_at')
    .eq('user_event_id', userEventId)
    .maybeSingle();
  if (error) return null;
  return data;
}
