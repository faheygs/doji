import { filterPostsForAudience } from '../../lib/feedAudience';
import type { Post } from '../../types/database';

function post(id: string, userId: string, isCommunity = false): Post {
  return {
    id,
    user_event_id: isCommunity ? null : 'ue-1',
    user_id: isCommunity ? null : userId,
    type: 'photo',
    is_community_poll: isCommunity,
    caption: null,
    photo_url: null,
    front_photo_url: null,
    video_url: null,
    is_late: false,
    selected_option_index: null,
    reaction_count: 0,
    comment_count: 0,
    comments_disabled: false,
    visibility: 'friends',
    created_at: '2026-01-01T12:00:00.000Z',
  };
}

describe('filterPostsForAudience', () => {
  const me = 'user-me';
  const followed = 'user-followed';
  const stranger = 'user-stranger';
  const followingIds = [me, followed];

  it('returns all posts for everyone', () => {
    const posts = [post('1', me), post('2', followed), post('3', stranger)];
    expect(filterPostsForAudience(posts, 'everyone', followingIds)).toHaveLength(3);
  });

  it('keeps self, followed users, and community poll cards on friends', () => {
    const posts = [
      post('poll', '', true),
      post('1', me),
      post('2', followed),
      post('3', stranger),
    ];
    const result = filterPostsForAudience(posts, 'friends', followingIds);
    expect(result.map((p) => p.id)).toEqual(['poll', '1', '2']);
  });

  it('excludes strangers when user follows one person', () => {
    const posts = [post('1', me), post('2', followed), post('3', stranger), post('4', stranger)];
    const result = filterPostsForAudience(posts, 'friends', followingIds);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.user_id === me || p.user_id === followed)).toBe(true);
  });
});
