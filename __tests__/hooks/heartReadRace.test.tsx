import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { useToggleCommentLike } from '../../hooks/useCommentControls';
import { useTogglePollVoteLike } from '../../hooks/usePollVoteLikes';
import { fetchCommentsForPost } from '../../hooks/useComments';
import { fetchPollVotersPage } from '../../lib/pollQueries';
import { preserveHeartRead, type HeartKind, type HeartRow } from '../../lib/heartConsistency';
import { executeCommand } from '../../lib/commandGateway';
import { supabase } from '../../lib/supabase';
import { commentScopeKey, type CommentWindow } from '../../lib/commentWindow';
import { readCommentWindow } from '../../lib/commentWindowReads';
import { row as commentRow, scope as commentScope, page as commentPage, windowData } from '../fixtures/commentWindow';

let mockUser = 'me';
let mockEpoch = 0;
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (select: (state: unknown) => unknown) => select({ session: { user: { id: mockUser } } }),
    {
      getState: () => ({ session: { user: { id: mockUser } } }),
    },
  ),
  captureProfileAccount: () => {
    const userId = mockUser,
      epoch = mockEpoch;
    return { userId, isCurrent: () => userId === mockUser && epoch === mockEpoch };
  },
}));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const command = jest.mocked(executeCommand);
const rpc = supabase.rpc as jest.Mock;
let client: QueryClient;
const row = { id: 'target', vote_id: 'target', my_like: false, like_count: 1, body: 'original' };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockUser = 'me';
  mockEpoch = 0;
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
  jest.clearAllTimers();
  jest.useRealTimers();
});

test('real bounded-window heart remains optimistic through a retained refresh and settles per identity', async () => {
  const key = commentScopeKey(commentScope);
  client.setQueryData(key, windowData(['target', 'other']));
  const write = deferred<Awaited<ReturnType<typeof executeCommand>>>();
  command.mockReturnValueOnce(write.promise);
  const { result } = renderHook(() => useToggleCommentLike(), {
    wrapper: ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
  });
  let pending!: Promise<unknown>;
  await act(async () => { pending = result.current.mutateAsync({ postId: 'post', commentId: 'target', liked: false }); });
  expect(client.getQueryData<CommentWindow>(key)?.pages[0].items[0].my_like).toBe(true);
  rpc.mockReturnValueOnce({ abortSignal: () => Promise.resolve({ data: [commentRow('target')], error: null }) })
    .mockReturnValueOnce({ abortSignal: () => Promise.resolve({ data: commentPage(['target']), error: null }) });
  const value = await readCommentWindow({ client, scope: commentScope, intent: 'refresh', signal: new AbortController().signal,
    visibleIds: () => new Set(['target']), isCurrent: () => true });
  expect(value.pages[0].items).toEqual([expect.objectContaining({ id: 'target', my_like: true, like_count: 1 })]);
  client.setQueryData(key, value);
  await act(async () => { write.resolve({ data: { comment_id: 'target', active: true, count: 3 }, error: null }); await pending; });
  expect(client.getQueryData<CommentWindow>(key)?.pages[0].items[0].my_like).toBe(true);
});

describe.each<HeartKind>(['comment', 'pollVote'])('%s heart', (kind) => {
  const key =
    kind === 'comment'
      ? ['comments', 'post', 'me', 'everyone']
      : ['pollVotersDetail', 'day', 'option', 'everyone', 'me'];
  const otherKey =
    kind === 'comment'
      ? ['comments', 'post', 'other', 'everyone']
      : ['pollVotersDetail', 'day', 'option', 'everyone', 'other'];
  function setup() {
    client.setQueryData(key, { pages: [[row]], pageParams: [null] });
    client.setQueryData(otherKey, { pages: [[row]], pageParams: [null] });
    return renderHook(
      () => {
        const comment = useToggleCommentLike(),
          vote = useTogglePollVoteLike();
        return {
          mutate: (liked = false) =>
            kind === 'comment'
              ? comment.mutateAsync({ postId: 'post', commentId: 'target', liked })
              : vote.mutateAsync({ pollVoteId: 'target', liked }),
        };
      },
      {
        wrapper: ({ children }: { children: React.ReactNode }) => (
          <QueryClientProvider client={client}>{children}</QueryClientProvider>
        ),
      },
    );
  }
  const current = () => client.getQueryData<InfiniteData<(typeof row)[]>>(key)!.pages[0][0];
  const read = () =>
    kind === 'comment'
      ? fetchCommentsForPost('post', 'everyone', null, undefined, { client, userId: 'me' })
      : fetchPollVotersPage('day', 'option', 'everyone', null, undefined, { client, userId: 'me' });

  test('realtime read during a write preserves its heart but reconciles text and deletions', async () => {
    const write = deferred<Awaited<ReturnType<typeof executeCommand>>>();
    command.mockReturnValueOnce(write.promise);
    const { result } = setup();
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutate();
    });
    expect(current()).toMatchObject({ my_like: true, like_count: 2 });
    const response = deferred<unknown>();
    rpc.mockReturnValueOnce({ abortSignal: () => response.promise });
    const reading = read();
    await act(async () => {
      write.resolve({ data: { poll_vote_id: 'target', active: true, count: 2 }, error: null });
      await pending;
      response.resolve({ data: [{ ...row, body: 'edited' }], error: null });
      const rows = await reading;
      expect(rows[0]).toMatchObject({ my_like: true, like_count: 2, body: 'edited' });
    });
    expect(client.getQueryData<InfiniteData<HeartRow[]>>(otherKey)!.pages[0][0].my_like).toBe(
      false,
    );
    expect(preserveHeartRead(client, kind, 'me', key, Date.now(), [])).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    rpc.mockReturnValueOnce({
      abortSignal: async () => ({ data: [{ ...row, like_count: 8 }], error: null }),
    });
    expect((await read())[0]).toMatchObject({ like_count: 8, my_like: false });
  });

  test('failed heart cannot roll back edited text, new rows or another actor', async () => {
    const write = deferred<Awaited<ReturnType<typeof executeCommand>>>();
    command.mockReturnValueOnce(write.promise);
    const { result } = setup();
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutate().catch(() => undefined);
    });
    client.setQueryData(key, {
      pages: [
        [
          { ...current(), body: 'edited' },
          { ...row, id: 'new', vote_id: 'new' },
        ],
      ],
      pageParams: [null],
    });
    await act(async () => {
      write.resolve({
        data: null,
        error: { message: 'denied', code: '42501', details: '', hint: '' },
      });
      await pending;
    });
    expect(current()).toMatchObject({ my_like: false, like_count: 1, body: 'edited' });
    expect(client.getQueryData<InfiniteData<HeartRow[]>>(key)!.pages[0]).toHaveLength(2);
  });

  test.each([true, false])(
    'older success/error cannot overwrite the latest toggle: success=%s',
    async (success) => {
      const first = deferred<Awaited<ReturnType<typeof executeCommand>>>();
      command
        .mockReturnValueOnce(first.promise)
        .mockResolvedValueOnce({
          data: { poll_vote_id: 'target', active: false, count: 1 },
          error: null,
        });
      const { result } = setup();
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current.mutate().catch(() => undefined);
      });
      await act(async () => {
        await result.current.mutate(true);
      });
      await act(async () => {
        first.resolve(
          success
            ? { data: { poll_vote_id: 'target', active: true, count: 2 }, error: null }
            : { data: null, error: { message: 'denied', code: '42501', details: '', hint: '' } },
        );
        await pending;
      });
      expect(current()).toMatchObject({ my_like: false, like_count: 1 });
    },
  );

  test('logout and return to the same account fences late receipts', async () => {
    const write = deferred<Awaited<ReturnType<typeof executeCommand>>>();
    command.mockReturnValueOnce(write.promise);
    const { result } = setup();
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current.mutate();
    });
    mockEpoch += 2;
    client.setQueryData(key, { pages: [[row]], pageParams: [null] });
    await act(async () => {
      write.resolve({ data: { poll_vote_id: 'target', active: true, count: 99 }, error: null });
      await pending;
    });
    expect(current()).toMatchObject({ my_like: false, like_count: 1 });
  });
});
