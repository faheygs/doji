import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { mapInfinitePosts } from './postCache';
import { supabase } from './supabase';
import type { Post } from '../types/database';
import { readThroughScaleGateway } from './scaleReadGateway';
import type { FeedAudience } from './feedAudience';
import { runAbortableQuery } from './requestSignal';

type EngagementSnapshot = Pick<
  Post,
  'reaction_count' | 'comment_count' | 'reaction_breakdown' | 'my_reactions'
> & { post_id: string };

const pendingSnapshots = new Map<string, Promise<EngagementSnapshot | null>>();

function readSnapshot(postId: string, audience: FeedAudience) {
  const key = `${postId}:${audience}`;
  const existing = pendingSnapshots.get(key);
  if (existing) return existing;
  const request = readThroughScaleGateway<unknown>(
    `/v1/posts/${encodeURIComponent(postId)}/engagement?audience=${audience}`,
    async () => {
      const { data: directData, error } = await runAbortableQuery(
        supabase.rpc('get_post_engagement_snapshot_v2', {
          p_post_id: postId,
          p_audience: audience,
        }),
      );
      if (error) throw error;
      return directData;
    },
  ).then((data) => (data ? (data as EngagementSnapshot) : null));
  pendingSnapshots.set(key, request);
  void request.finally(() => pendingSnapshots.delete(key)).catch(() => undefined);
  return request;
}

function containsPost(data: unknown, postId: string): boolean {
  const feed = data as InfiniteData<Post[]> | undefined;
  return feed?.pages.some((page) => page.some((post) => post.id === postId)) === true;
}

export async function refreshPostEngagement(
  client: QueryClient,
  postId: string,
  audience: FeedAudience = 'everyone',
) {
  const snapshot = await readSnapshot(postId, audience);
  if (!snapshot) return;
  const patch = (post: Post): Post => ({
    ...post,
    reaction_count: snapshot.reaction_count,
    comment_count: snapshot.comment_count,
    reaction_breakdown: snapshot.reaction_breakdown,
    my_reactions: snapshot.my_reactions,
  });
  client.setQueriesData<InfiniteData<Post[]>>(
    { predicate: (query) => query.queryKey[0] === 'feed' && query.queryKey[2] === audience },
    (old) => mapInfinitePosts(old, postId, patch),
  );
  if (audience === 'everyone') {
    client.setQueriesData<Post | null>(
      { predicate: (query) => query.queryKey[0] === 'post' && query.queryKey[1] === postId },
      (old) => (old ? patch(old) : old),
    );
  }
  await client.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'feed' &&
      query.queryKey[2] !== audience &&
      containsPost(query.state.data, postId),
    refetchType: 'none',
  });
}

/** Notification delivery can precede the post-channel aggregate hint. */
export async function refreshActivePostEngagement(client: QueryClient, postId: string) {
  const audiences = new Set<FeedAudience>();
  for (const query of client.getQueryCache().findAll({ queryKey: ['feed'], type: 'active' })) {
    if (!containsPost(query.state.data, postId)) continue;
    const audience = query.queryKey[2];
    if (audience === 'friends' || audience === 'everyone') audiences.add(audience);
  }
  if (client.getQueryCache().findAll({ queryKey: ['post', postId], type: 'active' }).length > 0) {
    audiences.add('everyone');
  }
  if (audiences.size === 0) {
    await client.invalidateQueries({
      predicate: (query) =>
        (query.queryKey[0] === 'feed' && containsPost(query.state.data, postId)) ||
        (query.queryKey[0] === 'post' && query.queryKey[1] === postId),
      refetchType: 'none',
    });
    return;
  }
  await Promise.all(
    [...audiences].map((audience) => refreshPostEngagement(client, postId, audience)),
  );
}
