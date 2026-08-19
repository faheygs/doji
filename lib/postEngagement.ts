import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { mapInfinitePosts } from './postCache';
import { supabase } from './supabase';
import type { Post } from '../types/database';

type EngagementSnapshot = Pick<
  Post,
  'reaction_count' | 'comment_count' | 'reaction_breakdown' | 'my_reactions'
> & { post_id: string };

export async function refreshPostEngagement(client: QueryClient, postId: string) {
  const { data, error } = await supabase.rpc('get_post_engagement_snapshot', {
    p_post_id: postId,
  });
  if (error) throw error;
  if (!data) return;
  const snapshot = data as EngagementSnapshot;
  const patch = (post: Post): Post => ({
    ...post,
    reaction_count: snapshot.reaction_count,
    comment_count: snapshot.comment_count,
    reaction_breakdown: snapshot.reaction_breakdown,
    my_reactions: snapshot.my_reactions,
  });
  client.setQueriesData<InfiniteData<Post[]>>(
    { predicate: (query) => query.queryKey[0] === 'feed' },
    (old) => mapInfinitePosts(old, postId, patch),
  );
  client.setQueriesData<Post | null>(
    { predicate: (query) => query.queryKey[0] === 'post' && query.queryKey[1] === postId },
    (old) => old ? patch(old) : old,
  );
}
