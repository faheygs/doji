/**
 * Tests for the community poll feed filtering logic.
 * The Supabase fetch itself is tested via integration; here we test
 * the audience-filtering layer that is pure TypeScript.
 */
import { filterPostsForAudience } from '../../lib/feedAudience';
import type { Post } from '../../types/database';

function mockPost(overrides: Partial<Post> = {}): Post {
  return {
    id: 'post-1',
    user_event_id: 'ue-1',
    user_id: 'u-1',
    type: 'photo',
    is_community_poll: false,
    daily_event_id: null,
    caption: null,
    photo_url: null,
    front_photo_url: null,
    video_url: null,
    is_late: false,
    selected_option_index: null,
    reaction_count: 0,
    comment_count: 0,
    comments_disabled: false,
    visibility: 'public',
    created_at: '2026-06-01T12:00:00Z',
    ...overrides,
  };
}

function communityPollPost(overrides: Partial<Post> = {}): Post {
  return mockPost({
    id: 'cp-1',
    user_id: null,
    user_event_id: null,
    type: 'poll_vote',
    is_community_poll: true,
    daily_event_id: 'de-1',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// filterPostsForAudience — community poll visibility
// ---------------------------------------------------------------------------
describe('filterPostsForAudience — community polls', () => {
  const FRIEND_ID = 'friend-1';
  const STRANGER_ID = 'stranger-1';

  it('everyone audience returns all posts including community polls', () => {
    const posts = [communityPollPost(), mockPost({ user_id: STRANGER_ID })];
    const result = filterPostsForAudience(posts, 'everyone', []);
    expect(result).toHaveLength(2);
  });

  it('friends audience includes community polls regardless of friendIds', () => {
    const poll = communityPollPost();
    const result = filterPostsForAudience([poll], 'friends', []);
    expect(result).toContain(poll);
  });

  it('friends audience includes posts from friends', () => {
    const friendPost = mockPost({ user_id: FRIEND_ID });
    const result = filterPostsForAudience([friendPost], 'friends', [FRIEND_ID]);
    expect(result).toContain(friendPost);
  });

  it('friends audience excludes posts from strangers', () => {
    const strangerPost = mockPost({ user_id: STRANGER_ID });
    const result = filterPostsForAudience([strangerPost], 'friends', [FRIEND_ID]);
    expect(result).not.toContain(strangerPost);
  });

  it('friends audience excludes null-user_id non-poll posts', () => {
    const post = mockPost({ user_id: null });
    const result = filterPostsForAudience([post], 'friends', [FRIEND_ID]);
    expect(result).not.toContain(post);
  });

  it('friends audience: mixed posts — only friends + polls pass', () => {
    const poll = communityPollPost();
    const friendPost = mockPost({ id: 'p2', user_id: FRIEND_ID });
    const strangerPost = mockPost({ id: 'p3', user_id: STRANGER_ID });
    const result = filterPostsForAudience([poll, friendPost, strangerPost], 'friends', [FRIEND_ID]);
    expect(result).toHaveLength(2);
    expect(result).toContain(poll);
    expect(result).toContain(friendPost);
    expect(result).not.toContain(strangerPost);
  });

  it('empty posts array returns empty array', () => {
    expect(filterPostsForAudience([], 'everyone', [])).toHaveLength(0);
    expect(filterPostsForAudience([], 'friends', ['u1'])).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Community poll post shape invariants
// ---------------------------------------------------------------------------
describe('community poll post invariants', () => {
  it('community poll has null user_id', () => {
    const poll = communityPollPost();
    expect(poll.user_id).toBeNull();
  });

  it('community poll has null user_event_id', () => {
    const poll = communityPollPost();
    expect(poll.user_event_id).toBeNull();
  });

  it('community poll has is_community_poll = true', () => {
    const poll = communityPollPost();
    expect(poll.is_community_poll).toBe(true);
  });
});
