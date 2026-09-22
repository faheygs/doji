import { useQuery } from '@tanstack/react-query';
import { attachReactionFields } from '../lib/postReactions';
import { runAbortableQuery } from '../lib/requestSignal';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/useAuthStore';
import type { Post } from '../types/database';

/** The profile owner's post from the authoritative current Doji, if one exists. */
export function useCurrentProfilePost(profileUserId?: string) {
  const me = useAuthStore((s) => s.session?.user?.id);
  return useQuery({
    queryKey: ['profilePost', profileUserId, me],
    queryFn: async ({ signal }): Promise<Post | null> => {
      if (!profileUserId) return null;
      const { data, error } = await runAbortableQuery(
        supabase.rpc('get_current_profile_post', { p_user_id: profileUserId }),
        signal,
      );
      if (error) throw error;
      if (!data) return null;
      const [post] = await attachReactionFields([data as Post], me, signal);
      return post ?? null;
    },
    enabled: Boolean(profileUserId && me),
    staleTime: 15_000,
  });
}
