import { filterCommentsForAudience, filterPostsForAudience } from '../../lib/feedAudience';
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
  const friend = 'user-friend';
  const stranger = 'user-stranger';
  const friendIds = [me, friend];

  it('returns all posts for everyone', () => {
    const posts = [post('1', me), post('2', friend), post('3', stranger)];
    expect(filterPostsForAudience(posts, 'everyone', friendIds)).toHaveLength(3);
  });

  it('keeps self, friends, and community poll cards on friends', () => {
    const posts = [
      post('poll', '', true),
      post('1', me),
      post('2', friend),
      post('3', stranger),
    ];
    const result = filterPostsForAudience(posts, 'friends', friendIds);
    expect(result.map((p) => p.id)).toEqual(['poll', '1', '2']);
  });

  it('excludes strangers when user has one friend', () => {
    const posts = [post('1', me), post('2', friend), post('3', stranger), post('4', stranger)];
    const result = filterPostsForAudience(posts, 'friends', friendIds);
    expect(result).toHaveLength(2);
    expect(result.every((p) => p.user_id === me || p.user_id === friend)).toBe(true);
  });
});

describe('filterCommentsForAudience', () => {
  const me = 'user-me';
  const friend = 'user-friend';
  const stranger = 'user-stranger';
  const friendIds = [me, friend];

  const comment = (id: string, userId: string) => ({ id, user_id: userId, body: 'hi' });

  it('returns all comments for everyone', () => {
    const comments = [comment('1', me), comment('2', friend), comment('3', stranger)];
    expect(filterCommentsForAudience(comments, 'everyone', friendIds)).toHaveLength(3);
  });

  it('keeps only friend and self comments on friends tab', () => {
    const comments = [comment('1', me), comment('2', friend), comment('3', stranger)];
    const result = filterCommentsForAudience(comments, 'friends', friendIds);
    expect(result.map((c) => c.id)).toEqual(['1', '2']);
  });
});
