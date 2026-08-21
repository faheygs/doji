import { QueryClient, type InfiniteData } from '@tanstack/react-query';
import { refreshPostEngagement } from '../../lib/postEngagement';
import { supabase } from '../../lib/supabase';
import type { Post } from '../../types/database';

jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: jest.fn() },
}));
jest.mock('../../lib/scaleReadGateway', () => ({
  readThroughScaleGateway: (_path: string, directRead: () => Promise<unknown>) => directRead(),
}));

const rpc = supabase.rpc as jest.Mock;

function post(commentCount: number, reactionCount: number): Post {
  return {
    id: 'post-1',
    user_event_id: 'event-1',
    user_id: 'owner-1',
    type: 'text',
    is_community_poll: false,
    caption: 'hello',
    photo_url: null,
    front_photo_url: null,
    video_url: null,
    is_late: false,
    selected_option_index: null,
    reaction_count: reactionCount,
    comment_count: commentCount,
    comments_disabled: false,
    visibility: 'friends',
    created_at: '2026-08-21T00:00:00.000Z',
    reaction_breakdown: {},
    my_reactions: [],
  };
}

function feed(value: Post): InfiniteData<Post[]> {
  return { pages: [[value]], pageParams: [{ offset: 0 }] };
}

describe('refreshPostEngagement', () => {
  it('patches only the requested audience and leaves the other scope stale', async () => {
    const client = new QueryClient();
    const friendsKey = ['feed', 'day-1', 'friends', 'me', 'full'];
    const everyoneKey = ['feed', 'day-1', 'everyone', 'me', 'full'];
    client.setQueryData(friendsKey, feed(post(0, 0)));
    client.setQueryData(everyoneKey, feed(post(9, 7)));
    rpc.mockResolvedValueOnce({
      data: {
        post_id: 'post-1',
        comment_count: 2,
        reaction_count: 3,
        reaction_breakdown: { FIRE: 3 },
        my_reactions: [],
      },
      error: null,
    });

    await refreshPostEngagement(client, 'post-1', 'friends');

    const friends = client.getQueryData<InfiniteData<Post[]>>(friendsKey)!;
    const everyone = client.getQueryData<InfiniteData<Post[]>>(everyoneKey)!;
    expect(friends.pages[0][0]).toMatchObject({ comment_count: 2, reaction_count: 3 });
    expect(everyone.pages[0][0]).toMatchObject({ comment_count: 9, reaction_count: 7 });
    expect(client.getQueryState(everyoneKey)?.isInvalidated).toBe(true);
    expect(rpc).toHaveBeenCalledWith('get_post_engagement_snapshot_v2', {
      p_post_id: 'post-1',
      p_audience: 'friends',
    });
    client.clear();
  });
});
