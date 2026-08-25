import { supabase } from './supabase';
import { createRequestSignal } from './requestSignal';
import { signPostMedia } from './postMedia';
import type { Post } from '../types/database';

/** Resolve an ambiguous client response without issuing a second write. */
export async function getCommittedPostReceipt(userEventId: string) {
  const request = createRequestSignal(undefined, 8_000);
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('id, user_event_id, user_id, type, caption, photo_url, front_photo_url, video_url, is_late, selected_option_index, reaction_count, comment_count, comments_disabled, visibility, created_at')
      .eq('user_event_id', userEventId)
      .abortSignal(request.signal)
      .maybeSingle();
    if (error) return null;
    const [post] = await signPostMedia(data ? [data as Post] : []);
    return post ?? null;
  } finally {
    request.cleanup();
  }
}
