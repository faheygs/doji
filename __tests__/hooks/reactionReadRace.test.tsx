import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { useToggleReaction } from '../../hooks/useToggleReaction';
import { refreshPostEngagement } from '../../lib/postEngagement';
import { fetchFeedPostsPage } from '../../lib/feedQueries';
import { executeCommand } from '../../lib/commandGateway';
import { supabase } from '../../lib/supabase';
import type { Post } from '../../types/database';

jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign(
    (select: (state: unknown) => unknown) => select({ session: { user: { id: 'me' } } }),
    {
      getState: () => ({ session: { user: { id: 'me' } } }),
    },
  ),
}));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));
jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
jest.mock('../../lib/scaleReadGateway', () => ({
  readThroughScaleGateway: (_path: string, read: () => unknown) => read(),
}));
const command = jest.mocked(executeCommand);
const rpc = supabase.rpc as jest.Mock;
const post = {
  id: 'post',
  reaction_count: 1,
  my_reactions: [],
  reaction_breakdown: { fire: 1 },
  comment_count: 2,
} as unknown as Post;
const key = ['feed', 'day', 'everyone', 'me', 'full'];
let client: QueryClient;
function current() {
  return client.getQueryData<InfiniteData<Post[]>>(key)!.pages[0][0];
}
function setup() {
  return renderHook(() => useToggleReaction(), {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
}
const variables = {
  postId: 'post',
  emoji: 'fire' as const,
  active: false,
  feedAudience: 'everyone' as const,
};
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  client.setQueryData(key, { pages: [[post]], pageParams: [null] });
});
afterEach(() => {
  cleanup();
  jest.clearAllTimers();
  client.clear();
  jest.useRealTimers();
});

test('a coalesced realtime read started before a tap cannot erase its committed receipt', async () => {
  let finishRead!: (value: unknown) => void;
  rpc.mockReturnValueOnce({
    abortSignal: () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  });
  const oldRead = refreshPostEngagement(client, 'post');
  command.mockResolvedValue({
    data: {
      post_id: 'post',
      emoji: 'fire',
      active: true,
      count: 2,
      current_emoji: 'fire',
      reaction_breakdown: { fire: 2 },
    },
    error: null,
  });
  const { result } = setup();
  await act(async () => {
    await result.current.mutateAsync({ ...variables });
  });
  expect(current()).toMatchObject({ reaction_count: 2, my_reactions: ['fire'] });
  const joined = refreshPostEngagement(client, 'post');
  expect(rpc).toHaveBeenCalledTimes(1);
  await act(async () => {
    finishRead({ data: { ...post, post_id: 'post', comment_count: 7 }, error: null });
    await Promise.all([oldRead, joined]);
  });
  expect(current()).toMatchObject({ reaction_count: 2, my_reactions: ['fire'], comment_count: 7 });
  rpc.mockReturnValue({
    abortSignal: () =>
      Promise.resolve({
        data: { ...post, post_id: 'post', reaction_count: 5, my_reactions: ['fire'] },
        error: null,
      }),
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(1500);
  });
  expect(current().reaction_count).toBe(5);
});

test('failed reaction restores only its reaction fields, not newer comments or posts', async () => {
  let finish!: (value: Awaited<ReturnType<typeof executeCommand>>) => void;
  command.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = setup();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = result.current.mutateAsync({ ...variables }).catch(() => undefined);
  });
  expect(current().reaction_count).toBe(2);
  client.setQueryData(key, {
    pages: [
      [
        { ...current(), comment_count: 9 },
        { ...post, id: 'new' },
      ],
    ],
    pageParams: [null],
  });
  await act(async () => {
    finish({
      data: null,
      error: { message: 'synthetic rejection', code: '42501', details: '', hint: '' },
    });
    await pending;
  });
  expect(current()).toMatchObject({ reaction_count: 1, my_reactions: [], comment_count: 9 });
  expect(client.getQueryData<InfiniteData<Post[]>>(key)!.pages[0][1].id).toBe('new');
});

test('a full feed response also preserves a newer reaction but never resurrects a removed row', async () => {
  let finishRead!: (value: unknown) => void;
  rpc.mockReturnValueOnce({
    abortSignal: () =>
      new Promise((resolve) => {
        finishRead = resolve;
      }),
  });
  const context = {
    client,
    userId: 'me',
    dailyEventId: 'day',
    audience: 'everyone' as const,
    unlocked: true,
  };
  const read = fetchFeedPostsPage(context, { offset: 0 });
  command.mockResolvedValue({
    data: {
      post_id: 'post',
      emoji: 'fire',
      active: true,
      count: 2,
      current_emoji: 'fire',
      reaction_breakdown: { fire: 2 },
    },
    error: null,
  });
  const { result } = setup();
  await act(async () => {
    await result.current.mutateAsync({ ...variables });
  });
  finishRead({ data: [{ ...post, comment_count: 8 }], error: null });
  expect(await read).toMatchObject([
    { reaction_count: 2, my_reactions: ['fire'], comment_count: 8 },
  ]);
  rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: [], error: null }) });
  expect(await fetchFeedPostsPage(context, { offset: 0 })).toEqual([]);
});

test('an older failed command cannot roll back a newer committed selection', async () => {
  let finish!: (value: Awaited<ReturnType<typeof executeCommand>>) => void;
  command.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const { result } = setup();
  let first!: Promise<unknown>;
  await act(async () => {
    first = result.current.mutateAsync({ ...variables }).catch(() => undefined);
  });
  command.mockResolvedValue({
    data: {
      post_id: 'post',
      emoji: 'heart',
      active: true,
      count: 2,
      current_emoji: 'heart',
      reaction_breakdown: { fire: 1, heart: 1 },
    },
    error: null,
  });
  await act(async () => {
    await result.current.mutateAsync({ ...variables, emoji: 'heart' });
  });
  await act(async () => {
    finish({
      data: null,
      error: { message: 'synthetic rejection', code: '42501', details: '', hint: '' },
    });
    await first;
  });
  expect(current()).toMatchObject({ reaction_count: 2, my_reactions: ['heart'] });
});
