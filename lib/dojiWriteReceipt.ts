import { supabase } from './supabase';

/** Resolve an ambiguous client response without issuing a second write. */
export async function getCommittedPostReceipt(userEventId: string) {
  const { data, error } = await supabase
    .from('posts')
    .select('*')
    .eq('user_event_id', userEventId)
    .maybeSingle();
  if (error) return null;
  return data;
}
