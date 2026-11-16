import { attachPostDetailEngagement } from '../../lib/postDetailEngagement';
import type { Post } from '../../types/database';

const mockRead = jest.fn();
const mockRpc = jest.fn();
const mockGateway = jest.fn();
jest.mock('../../lib/supabase', () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));
jest.mock('../../lib/runMemberRead', () => ({
  runMemberRead: (...args: unknown[]) => mockRead(...args),
}));
jest.mock('../../lib/scaleReadGateway', () => ({
  readThroughScaleGateway: (...args: unknown[]) => mockGateway(...args),
}));

const post: Post = {
  id: 'post',
  comment_count: 0,
  reaction_count: 0,
  photo_url: 'private-object',
  type: 'photo',
  user_event_id: null,
  user_id: 'author',
  caption: null,
  front_photo_url: null,
  video_url: null,
  is_late: false,
  selected_option_index: null,
  comments_disabled: false,
  visibility: 'public',
  created_at: '2026-11-16T12:00:00Z',
};
const snapshot = {
  post_id: 'post',
  comment_count: 5,
  reaction_count: 2,
  reaction_breakdown: { fire: 1, heart: 1 },
  my_reactions: ['fire', 'love', 'unknown'],
};
const signal = new AbortController().signal;
beforeEach(() => {
  jest.resetAllMocks();
  mockRpc.mockReturnValue('query');
  mockRead.mockResolvedValue({ data: snapshot, error: null });
  mockGateway.mockImplementation((_path, direct) => direct());
});

test.each<Post['type']>(['photo', 'task_complete', 'poll_vote'])(
  '%s detail replaces legacy zero counters without fetching comment pages',
  async (type) => {
    const result = await attachPostDetailEngagement({ ...post, type }, signal);
    expect(result).toEqual({
      ...post,
      type,
      comment_count: 5,
      reaction_count: 2,
      reaction_breakdown: snapshot.reaction_breakdown,
      my_reactions: ['fire', 'heart'],
    });
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('get_post_engagement_snapshot_v2', {
      p_post_id: 'post',
      p_audience: 'everyone',
    });
    expect(mockRead).toHaveBeenCalledWith('query', signal);
    expect(mockGateway).toHaveBeenCalledWith(
      '/v1/posts/post/engagement?audience=everyone',
      expect.any(Function),
      signal,
    );
  },
);

test('gateway result is used without a direct fallback', async () => {
  mockGateway.mockResolvedValue(snapshot);
  expect((await attachPostDetailEngagement(post, signal))?.comment_count).toBe(5);
  expect(mockRpc).not.toHaveBeenCalled();
});

test.each(['gateway', 'direct'])(
  '%s failure remains an error, never zero or stale detail',
  async (path) => {
    const error = new Error('unavailable');
    if (path === 'gateway') mockGateway.mockRejectedValue(error);
    else mockRead.mockRejectedValue(error);
    await expect(attachPostDetailEngagement(post, signal)).rejects.toBe(error);
    expect(mockRpc).toHaveBeenCalledTimes(path === 'gateway' ? 0 : 1);
  },
);

test('deleted or no-longer-visible post does not retain the earlier detail', async () => {
  mockRead.mockResolvedValue({ data: null });
  expect(await attachPostDetailEngagement(post, signal)).toBeNull();
});

test('an authoritative empty snapshot is a legitimate zero', async () => {
  mockRead.mockResolvedValue({
    data: {
      ...snapshot,
      comment_count: 0,
      reaction_count: 0,
      reaction_breakdown: {},
      my_reactions: [],
    },
  });
  expect(await attachPostDetailEngagement(post, signal)).toMatchObject({
    comment_count: 0,
    reaction_count: 0,
    reaction_breakdown: {},
    my_reactions: [],
  });
});

test.each([
  undefined,
  {},
  { ...snapshot, post_id: 'other' },
  { ...snapshot, comment_count: -1 },
  { ...snapshot, comment_count: '5' },
  { ...snapshot, reaction_count: 1.5 },
  { ...snapshot, reaction_count: Infinity },
  { ...snapshot, reaction_breakdown: null },
  { ...snapshot, reaction_breakdown: [] },
  { ...snapshot, reaction_breakdown: { fire: -1 } },
  { ...snapshot, my_reactions: null },
  { ...snapshot, my_reactions: [3] },
])('malformed or wrong-post engagement fails closed (%j)', async (data) => {
  mockRead.mockResolvedValue({ data });
  await expect(attachPostDetailEngagement(post, signal)).rejects.toThrow('Invalid post engagement');
});

test('unexpected snapshot fields cannot overwrite authorized post content', async () => {
  mockRead.mockResolvedValue({
    data: {
      ...snapshot,
      id: 'different',
      photo_url: 'unexpected',
      profile: { email: 'not-retained' },
    },
  });
  const result = await attachPostDetailEngagement(post, signal);
  expect(result?.photo_url).toBe(post.photo_url);
  expect(result?.id).toBe(post.id);
  expect(result).not.toHaveProperty('profile');
});
