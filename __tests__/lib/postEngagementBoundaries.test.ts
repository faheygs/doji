import { QueryClient, QueryObserver, type InfiniteData } from '@tanstack/react-query';
import { refreshActivePostEngagement, refreshPostEngagement } from '../../lib/postEngagement';
import { supabase } from '../../lib/supabase';
import { readThroughScaleGateway } from '../../lib/scaleReadGateway';
import type { Post } from '../../types/database';
let mockMemberId: string | null = 'viewer';
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: {
    getState: () => ({ session: mockMemberId ? { user: { id: mockMemberId } } : null }),
  },
}));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../lib/scaleReadGateway', () => ({
  readThroughScaleGateway: jest.fn((_path, read) => read()),
}));
const rpc = supabase.rpc as jest.Mock;
const post: Post = {
  id: 'post',
  user_event_id: 'event',
  user_id: 'author',
  type: 'task_complete',
  caption: 'Synthetic post',
  is_community_poll: false,
  photo_url: null,
  front_photo_url: null,
  video_url: null,
  is_late: false,
  selected_option_index: null,
  reaction_count: 1,
  comment_count: 2,
  comments_disabled: false,
  visibility: 'friends',
  created_at: '2026-10-01T12:00:00Z',
  reaction_breakdown: { fire: 1, like: 0, dislike: 0, laugh: 0, wow: 0, heart: 0 },
  my_reactions: [],
};
const snapshot = {
  post_id: 'post',
  reaction_count: 4,
  comment_count: 6,
  reaction_breakdown: { fire: 4, like: 0, dislike: 0, laugh: 0, wow: 0, heart: 0 },
  my_reactions: ['fire'],
} satisfies Pick<
  Post,
  'reaction_count' | 'comment_count' | 'reaction_breakdown' | 'my_reactions'
> & { post_id: string };
const feed = (value = post): InfiniteData<Post[]> => ({ pages: [[value]], pageParams: [null] });
const key = (audience: string, day = 'day') => ['feed', day, audience, 'viewer'];
let client: QueryClient;
let unsubscribe: (() => void)[];
function active(queryKey: readonly unknown[]) {
  const observer = new QueryObserver(client, { queryKey, staleTime: Infinity });
  unsubscribe.push(observer.subscribe(() => {}));
}
beforeEach(() => {
  jest.clearAllMocks();
  mockMemberId = 'viewer';
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  unsubscribe = [];
  rpc
    .mockReset()
    .mockReturnValue({ abortSignal: () => Promise.resolve({ data: snapshot, error: null }) });
});
afterEach(() => {
  unsubscribe.forEach((stop) => stop());
  client.clear();
});

test('default audience patches matching public detail and feed only; unrelated records keep data', async () => {
  client.setQueryData(['post', 'post'], post);
  client.setQueryData(['post', 'other'], { ...post, id: 'other' });
  client.setQueryData(['post', 'post', 'empty'], null);
  client.setQueryData(key('everyone'), feed());
  client.setQueryData(key('friends'), feed());
  client.setQueryData(key('friends', 'other-day'), feed({ ...post, id: 'other' }));
  await refreshPostEngagement(client, 'post');
  const { post_id: _snapshotId, ...engagement } = snapshot;
  expect(client.getQueryData(['post', 'post'])).toEqual({ ...post, ...engagement });
  expect(client.getQueryData(['post', 'other'])).toEqual({ ...post, id: 'other' });
  expect(client.getQueryData(['post', 'post', 'empty'])).toBeNull();
  expect(client.getQueryState(key('friends'))?.isInvalidated).toBe(true);
  expect(client.getQueryState(key('friends', 'other-day'))?.isInvalidated).toBe(false);
  expect(
    client.getQueryData<InfiniteData<Post[]>>(key('everyone'))!.pages[0][0].reaction_count,
  ).toBe(4);
  expect(readThroughScaleGateway).toHaveBeenCalledWith(
    '/v1/posts/post/engagement?audience=everyone',
    expect.any(Function),
  );
});
test('missing authorized snapshot leaves all cached values and freshness unchanged', async () => {
  rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: null, error: null }) });
  client.setQueryData(key('everyone'), feed());
  client.setQueryData(key('friends'), feed());
  await refreshPostEngagement(client, 'post');
  expect(client.getQueryData(key('everyone'))).toEqual(feed());
  expect(client.getQueryState(key('friends'))?.isInvalidated).toBe(false);
});
test('failed read does not patch caches and can be retried after in-flight cleanup', async () => {
  rpc.mockReturnValueOnce({
    abortSignal: () =>
      Promise.resolve({ data: null, error: { message: 'denied', code: '42501' }, status: 403 }),
  });
  client.setQueryData(key('everyone'), feed());
  await expect(refreshPostEngagement(client, 'post')).rejects.toMatchObject({ message: 'denied' });
  expect(client.getQueryData(key('everyone'))).toEqual(feed());
  await refreshPostEngagement(client, 'post');
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(
    client.getQueryData<InfiniteData<Post[]>>(key('everyone'))!.pages[0][0].comment_count,
  ).toBe(6);
});
test('concurrent same-audience refreshes share a read while different audiences stay separate', async () => {
  let finish!: (value: { data: typeof snapshot; error: null }) => void;
  const pending = new Promise<{ data: typeof snapshot; error: null }>((resolve) => {
    finish = resolve;
  });
  rpc.mockReturnValue({ abortSignal: () => pending });
  const first = refreshPostEngagement(client, 'post', 'friends');
  const second = refreshPostEngagement(client, 'post', 'friends');
  const publicRead = refreshPostEngagement(client, 'post');
  expect(rpc).toHaveBeenCalledTimes(2);
  finish({ data: snapshot, error: null });
  await Promise.all([first, second, publicRead]);
  await refreshPostEngagement(client, 'post');
  expect(rpc).toHaveBeenCalledTimes(3);
});
test('inactive feed/detail are marked stale without fetching or touching unrelated posts', async () => {
  client.setQueryData(key('friends'), feed());
  client.setQueryData(['post', 'post'], post);
  client.setQueryData(['post', 'other'], { ...post, id: 'other' });
  client.setQueryData(key('everyone'), feed({ ...post, id: 'other' }));
  client.getQueryCache().build(client, { queryKey: key('friends', 'unloaded') });
  await refreshActivePostEngagement(client, 'post');
  expect(rpc).not.toHaveBeenCalled();
  expect(client.getQueryState(key('friends'))?.isInvalidated).toBe(true);
  expect(client.getQueryState(['post', 'post'])?.isInvalidated).toBe(true);
  expect(client.getQueryState(['post', 'other'])?.isInvalidated).toBe(false);
  expect(client.getQueryState(key('everyone'))?.isInvalidated).toBe(false);
});
test('active friends and public detail refresh both exact audiences once, ignoring other active posts', async () => {
  client.setQueryData(key('friends'), feed());
  client.setQueryData(key('friends', 'second'), feed());
  client.setQueryData(key('everyone'), feed({ ...post, id: 'other' }));
  client.setQueryData(key('unknown'), feed());
  client.setQueryData(['post', 'post'], post);
  [
    key('friends'),
    key('friends', 'second'),
    key('everyone'),
    key('unknown'),
    ['post', 'post'],
  ].forEach(active);
  await refreshActivePostEngagement(client, 'post');
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls.map(([, args]) => args.p_audience).sort()).toEqual(['everyone', 'friends']);
  expect(client.getQueryData<InfiniteData<Post[]>>(key('friends'))!.pages[0][0].comment_count).toBe(
    6,
  );
});
test.each(['direct', 'active'] as const)(
  'signed-out %s refresh never reads or invalidates member caches',
  async (kind) => {
    client.setQueryData(key('everyone'), feed());
    active(key('everyone'));
    mockMemberId = null;
    if (kind === 'direct') await refreshPostEngagement(client, 'post');
    else await refreshActivePostEngagement(client, 'post');
    expect(rpc).not.toHaveBeenCalled();
    expect(client.getQueryState(key('everyone'))?.isInvalidated).toBe(false);
  },
);

test.each(['switch', 'logout'] as const)(
  'an engagement read completed after %s cannot patch the next account',
  async (scenario) => {
    let finish!: (value: { data: typeof snapshot; error: null }) => void;
    rpc.mockReturnValueOnce({
      abortSignal: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    });
    client.setQueryData(key('everyone'), feed());
    const pending = refreshPostEngagement(client, 'post');
    mockMemberId = scenario === 'switch' ? 'next-viewer' : null;
    client.clear();
    client.setQueryData(
      ['feed', 'day', 'everyone', 'next-viewer', 'full'],
      feed({ ...post, reaction_count: 80 }),
    );
    const before = client.getQueriesData({});
    finish({ data: snapshot, error: null });
    await pending;
    expect(client.getQueriesData({})).toEqual(before);
  },
);

test('different members never share an in-flight engagement snapshot', async () => {
  const finishes: Array<(value: { data: typeof snapshot; error: null }) => void> = [];
  rpc.mockReturnValue({
    abortSignal: () =>
      new Promise((resolve) => {
        finishes.push(resolve);
      }),
  });
  const first = refreshPostEngagement(client, 'post');
  mockMemberId = 'next-viewer';
  const second = refreshPostEngagement(client, 'post');
  const calls = rpc.mock.calls.length;
  finishes.forEach((finish) => finish({ data: snapshot, error: null }));
  await Promise.all([first, second]);
  expect(calls).toBe(2);
});

test('an active everyone feed does not fetch a nonvisible friends audience', async () => {
  client.setQueryData(key('everyone'), feed());
  client.setQueryData(key('friends'), feed());
  active(key('everyone'));
  await refreshActivePostEngagement(client, 'post');
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('get_post_engagement_snapshot_v2', {
    p_post_id: 'post',
    p_audience: 'everyone',
  });
  expect(client.getQueryState(key('friends'))?.isInvalidated).toBe(true);
});
