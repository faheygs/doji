import React from 'react';
import { act, cleanup, renderHook } from '@testing-library/react-native';
import {
  type InfiniteData,
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useAddComment } from '../../hooks/useAddComment';
import { useEditComment, useDeleteComment } from '../../hooks/useCommentMutations';
import { useToggleReaction, patchReactionToggle } from '../../hooks/useToggleReaction';
import { executeCommand } from '../../lib/commandGateway';
import { refreshPostEngagement } from '../../lib/postEngagement';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';
import type { Comment, Post, Profile } from '../../types/database';

let mockState: { session: { user: { id: string } } | null; profile: Profile | null };
jest.mock('../../stores/useAuthStore', () => ({
  useAuthStore: Object.assign((select: (state: unknown) => unknown) => select(mockState), {
    getState: () => mockState,
  }),
}));
jest.mock('../../lib/commandGateway', () => ({ executeCommand: jest.fn() }));
jest.mock('../../lib/postEngagement', () => ({ refreshPostEngagement: jest.fn() }));
jest.mock('../../lib/queryInvalidationBatcher', () => ({ scheduleQueryInvalidation: jest.fn() }));
const command = jest.mocked(executeCommand);
const refresh = jest.mocked(refreshPostEngagement);
let client: QueryClient;
const post = {
  id: 'post-a',
  comment_count: 2,
  reaction_count: 3,
  reaction_breakdown: { fire: 2, heart: 1 },
  my_reactions: [],
} as unknown as Post;
const comment = {
  id: 'comment-a',
  post_id: 'post-a',
  user_id: 'member-a',
  body: 'Original',
  like_count: 2,
  created_at: '2026-10-01',
  parent_id: null,
} as Comment;
const feedKey = ['feed', 'day', 'everyone', 'member-a', 'full'];
const friendsKey = ['feed', 'day', 'friends', 'member-a', 'full'];
const postKey = ['post', 'post-a', 'member-a'];
const commentsKey = ['comments', 'post-a', 'member-a', 'everyone'];
const friendCommentsKey = ['comments', 'post-a', 'member-a', 'friends'];
const otherCommentsKey = ['comments', 'other-post', 'member-a', 'everyone'];
const pages = <T,>(rows: T[]): InfiniteData<T[]> => ({ pages: [rows], pageParams: [null] });
function seed() {
  client.setQueryData(feedKey, pages([post, { ...post, id: 'other-post' }]));
  client.setQueryData(
    friendsKey,
    pages([{ ...post, reaction_count: 1, reaction_breakdown: { fire: 1 } }]),
  );
  client.setQueryData(postKey, post);
  client.setQueryData(commentsKey, pages([comment, { ...comment, id: 'comment-b' }]));
  client.setQueryData(friendCommentsKey, pages([comment]));
  client.setQueryData(otherCommentsKey, pages([{ ...comment, post_id: 'other-post' }]));
  client.setQueryData(['post', 'other-post', 'member-a'], { ...post, id: 'other-post' });
  client.setQueryData(['unrelated'], { untouched: true });
}
function setup() {
  return renderHook(
    () => ({
      add: useAddComment(),
      edit: useEditComment(),
      delete: useDeleteComment(),
      reaction: useToggleReaction(),
    }),
    {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}
const variables = () => ({
  postId: 'post-a',
  commentId: 'comment-a',
  body: '  Nice photo  ',
  feedAudience: 'everyone' as const,
  emoji: 'fire' as const,
  active: false,
  commandId: undefined as string | undefined,
});
const receipt = (operation: string) =>
  operation === 'add'
    ? { ...comment, id: 'saved-comment', body: 'Nice photo' }
    : operation === 'reaction'
      ? {
          post_id: 'post-a',
          emoji: 'fire',
          active: true,
          count: 9,
          current_emoji: 'fire',
          reaction_breakdown: { fire: 8, heart: 1 },
        }
      : null;
function defer() {
  let resolve!: (value: Awaited<ReturnType<typeof executeCommand>>) => void;
  command.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  return resolve;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  notifyManager.setScheduler((callback) => callback());
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  });
  mockState = {
    session: { user: { id: 'member-a' } },
    profile: { id: 'member-a', username: 'tester' } as Profile,
  };
  refresh.mockResolvedValue(undefined);
  command.mockReset();
});
afterEach(async () => {
  cleanup();
  await act(async () => {
    jest.runOnlyPendingTimers();
  });
  client.clear();
  jest.useRealTimers();
  jest.restoreAllMocks();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

describe.each(['add', 'edit', 'delete', 'reaction'] as const)('%s command', (operation) => {
  test('optimistic update is immediate, exact and reconciles a committed result', async () => {
    seed();
    const finish = defer();
    const { result } = setup();
    const vars = variables();
    const untouched = client.getQueryData(otherCommentsKey);
    let pending!: Promise<unknown>;
    await act(async () => {
      pending = result.current[operation].mutateAsync(vars);
    });
    const rows = client.getQueryData<InfiniteData<Comment[]>>(commentsKey)!.pages[0];
    const updated = client.getQueryData<Post>(postKey)!;
    if (operation === 'add') {
      expect(rows[0]).toMatchObject({
        id: `optimistic:${vars.commandId}`,
        body: 'Nice photo',
        user_id: 'member-a',
        profile: mockState.profile,
      });
      expect(updated.comment_count).toBe(3);
    } else if (operation === 'edit') {
      expect(rows[0].body).toBe('Nice photo');
      expect(rows[1].body).toBe('Original');
    } else if (operation === 'delete') {
      expect(rows.map((row) => row.id)).toEqual(['comment-b']);
      expect(updated.comment_count).toBe(1);
    } else expect(updated).toMatchObject({ reaction_count: 4, my_reactions: ['fire'] });
    expect(client.getQueryData(otherCommentsKey)).toEqual(untouched);
    expect(client.getQueryData<InfiniteData<Post[]>>(feedKey)!.pages[0][1]).toEqual({
      ...post,
      id: 'other-post',
    });
    expect(command).toHaveBeenCalledTimes(1);
    await act(async () => {
      finish({ data: receipt(operation), error: null } as never);
      await pending;
    });
    const commandName = {
      add: 'submit_comment',
      edit: 'edit_comment',
      delete: 'delete_comment',
      reaction: 'set_post_reaction',
    }[operation];
    const payload =
      operation === 'add'
        ? { p_post_id: 'post-a', p_body: 'Nice photo', p_parent_id: null }
        : operation === 'edit'
          ? { p_comment_id: 'comment-a', p_body: 'Nice photo' }
          : operation === 'delete'
            ? { p_comment_id: 'comment-a' }
            : { p_post_id: 'post-a', p_emoji: 'fire', p_active: true };
    expect(command).toHaveBeenCalledWith(commandName, {
      ...payload,
      p_idempotency_key: vars.commandId,
    });
    expect(vars.commandId).toEqual(expect.any(String));
    if (operation === 'add')
      expect(client.getQueryData<InfiniteData<Comment[]>>(commentsKey)!.pages[0][0]).toMatchObject({
        id: 'saved-comment',
        like_count: 2,
        my_like: false,
      });
    if (operation === 'reaction') {
      expect(client.getQueryData<Post>(postKey)).toMatchObject({ reaction_count: 9 });
      expect(client.getQueryData<InfiniteData<Post[]>>(feedKey)!.pages[0][0].reaction_count).toBe(
        9,
      );
      expect(client.getQueryData<InfiniteData<Post[]>>(friendsKey)!.pages[0][0]).toMatchObject({
        reaction_count: 2,
        my_reactions: ['fire'],
      });
      expect(refresh).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(1500);
      });
    }
    if (operation !== 'edit') expect(refresh).toHaveBeenCalledWith(client, 'post-a', 'everyone');
  });

  test.each(['envelope', 'transport'] as const)(
    '%s failure restores all touched cache entries',
    async (failure) => {
      seed();
      const before = client.getQueriesData({});
      if (failure === 'envelope')
        command.mockResolvedValueOnce({ data: null, error: new Error('offline') } as never);
      else command.mockRejectedValueOnce(new Error('offline'));
      const { result } = setup();
      await act(async () => {
        await expect(result.current[operation].mutateAsync(variables())).rejects.toThrow('offline');
      });
      expect(client.getQueriesData({})).toEqual(before);
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  test('deliberate retry reuses the exact idempotency key', async () => {
    seed();
    command
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ data: receipt(operation), error: null } as never);
    const { result } = setup();
    const vars = variables();
    await act(async () => {
      await expect(result.current[operation].mutateAsync(vars)).rejects.toThrow('offline');
    });
    await act(async () => {
      await result.current[operation].mutateAsync(vars);
    });
    expect(command.mock.calls[0]).toEqual(command.mock.calls[1]);
    expect(command).toHaveBeenCalledTimes(2);
  });

  test.each(['signed-out', 'stale-callback'] as const)(
    '%s cannot alter cached data or send a command',
    async (scenario) => {
      seed();
      if (scenario === 'signed-out') mockState.session = null;
      const { result } = setup();
      if (scenario === 'stale-callback') mockState.session = { user: { id: 'member-b' } };
      const before = client.getQueriesData({});
      const changes: unknown[] = [];
      const unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success')
          changes.push(event.query.queryKey);
      });
      command.mockResolvedValue({ data: receipt(operation), error: null } as never);
      await act(async () => {
        await expect(result.current[operation].mutateAsync(variables())).rejects.toThrow(
          'Not authenticated',
        );
      });
      unsubscribe();
      expect(command).not.toHaveBeenCalled();
      expect(changes).toEqual([]);
      expect(client.getQueriesData({})).toEqual(before);
      expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
    },
  );

  test.each([
    [true, 'switch'],
    [false, 'switch'],
    [true, 'logout'],
    [false, 'logout'],
  ] as const)(
    'late success=%s after %s rerender cannot repopulate or alter caches',
    async (success, scenario) => {
      seed();
      const finish = defer();
      const { result, rerender } = setup();
      let pending!: Promise<unknown>;
      await act(async () => {
        pending = result.current[operation].mutateAsync(variables()).catch((error) => error);
      });
      mockState.session = scenario === 'logout' ? null : { user: { id: 'member-b' } };
      mockState.profile = scenario === 'logout' ? null : ({ id: 'member-b' } as Profile);
      client.clear();
      if (scenario === 'switch')
        client.setQueryData(
          ['feed', 'day', 'everyone', 'member-b', 'full'],
          pages([{ ...post, reaction_count: 40 }]),
        );
      const next = client.getQueriesData({});
      rerender({});
      const invalidate = jest.spyOn(client, 'invalidateQueries');
      await act(async () => {
        finish({
          data: success ? receipt(operation) : null,
          error: success ? null : new Error('offline'),
        } as never);
        await pending;
        jest.advanceTimersByTime(1500);
      });
      expect(client.getQueriesData({})).toEqual(next);
      expect(refresh).not.toHaveBeenCalled();
      expect(invalidate).not.toHaveBeenCalled();
      expect(scheduleQueryInvalidation).not.toHaveBeenCalled();
    },
  );

  test('empty caches do not invent records and cancellation cannot delay the command', async () => {
    jest.spyOn(client, 'cancelQueries').mockReturnValueOnce(new Promise(() => {}));
    command.mockResolvedValue({ data: receipt(operation), error: null } as never);
    const { result } = setup();
    await act(async () => {
      await result.current[operation].mutateAsync(variables());
    });
    expect(command).toHaveBeenCalledTimes(1);
    expect(client.getQueriesData({})).toEqual([]);
  });

  test('unloaded queries and missing post details are not fabricated by optimistic updates', async () => {
    client.getQueryCache().build(client, { queryKey: feedKey });
    client.getQueryCache().build(client, { queryKey: commentsKey });
    client.setQueryData(postKey, null);
    command.mockResolvedValue({ data: receipt(operation), error: null } as never);
    const { result } = setup();
    await act(async () => {
      await result.current[operation].mutateAsync(variables());
    });
    expect(client.getQueryData(feedKey)).toBeUndefined();
    expect(client.getQueryData(commentsKey)).toBeUndefined();
    expect(client.getQueryData(postKey)).toBeNull();
  });
});

describe.each(['add', 'edit'] as const)('%s content validation', (operation) => {
  test.each(['   ', 'shit'])(
    'invalid body %j never enters the visible cache or server command',
    async (body) => {
      seed();
      const { result } = setup();
      const changes: unknown[] = [];
      const unsubscribe = client.getQueryCache().subscribe((event) => {
        if (event.type === 'updated' && event.action.type === 'success')
          changes.push(event.query.queryKey);
      });
      await act(async () => {
        await expect(
          result.current[operation].mutateAsync({ ...variables(), body }),
        ).rejects.toThrow(body.trim() ? 'prohibited language' : 'cannot be empty');
      });
      unsubscribe();
      expect(changes).toEqual([]);
      expect(command).not.toHaveBeenCalled();
    },
  );
});

test.each([null, 'root-comment'])(
  'add comment parent %s is retained in the command',
  async (parentId) => {
    command.mockResolvedValue({ data: receipt('add'), error: null } as never);
    const { result } = setup();
    await act(async () => {
      await result.current.add.mutateAsync({ ...variables(), parentId });
    });
    expect(command).toHaveBeenCalledWith(
      'submit_comment',
      expect.objectContaining({ p_parent_id: parentId }),
    );
  },
);

test('reply targets the exact nested comment while optimism retains its thread root', async () => {
  seed();
  const finish = defer();
  const { result } = setup();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = result.current.add.mutateAsync({
      ...variables(),
      parentId: 'root',
      replyToCommentId: 'nested',
    });
  });
  expect(client.getQueryData<InfiniteData<Comment[]>>(commentsKey)!.pages[0][0]).toMatchObject({
    parent_id: 'root',
    reply_to_comment_id: 'nested',
  });
  expect(command).toHaveBeenCalledWith(
    'submit_comment',
    expect.objectContaining({ p_parent_id: 'nested' }),
  );
  await act(async () => {
    finish({ data: receipt('add'), error: null } as never);
    await pending;
  });
});

test('add without a matching profile does not attribute the optimistic comment to another member', async () => {
  seed();
  mockState.profile = { id: 'member-b', username: 'other' } as Profile;
  const finish = defer();
  const { result } = setup();
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = result.current.add.mutateAsync(variables());
  });
  expect(
    client.getQueryData<InfiniteData<Comment[]>>(commentsKey)!.pages[0][0].profile,
  ).toBeUndefined();
  await act(async () => {
    finish({
      data: { ...(receipt('add') as Comment), like_count: undefined },
      error: null,
    } as never);
    await pending;
  });
  expect(client.getQueryData<InfiniteData<Comment[]>>(commentsKey)!.pages[0][0]).toMatchObject({
    like_count: 0,
    my_like: false,
  });
});

test('delete count is clamped when a cached aggregate is already zero', async () => {
  seed();
  client.setQueryData(postKey, { ...post, comment_count: 0 });
  client.setQueryData(feedKey, pages([{ ...post, comment_count: 0 }]));
  command.mockResolvedValue({ data: null, error: null } as never);
  const { result } = setup();
  await act(async () => {
    await result.current.delete.mutateAsync(variables());
  });
  expect(client.getQueryData<Post>(postKey)!.comment_count).toBe(0);
  expect(client.getQueryData<InfiniteData<Post[]>>(feedKey)!.pages[0][0].comment_count).toBe(0);
});

test('reaction removal receipt clears selection and preserves the optimistic breakdown if omitted', async () => {
  seed();
  client.setQueryData(postKey, { ...post, my_reactions: ['fire'] });
  command.mockResolvedValue({ data: { count: 2, current_emoji: null }, error: null } as never);
  const { result } = setup();
  await act(async () => {
    await result.current.reaction.mutateAsync({
      ...variables(),
      active: true,
      feedAudience: 'friends',
    });
  });
  expect(client.getQueryData<Post>(postKey)).toMatchObject({
    reaction_count: 2,
    my_reactions: [],
    reaction_breakdown: { fire: 1, heart: 1 },
  });
  await act(async () => {
    jest.advanceTimersByTime(1500);
  });
  expect(refresh).toHaveBeenCalledWith(client, 'post-a', 'friends');
});

test('empty reaction receipt does not invent authoritative counts or schedule a refresh', async () => {
  seed();
  command.mockResolvedValue({ data: null, error: null } as never);
  const { result } = setup();
  await act(async () => {
    await result.current.reaction.mutateAsync(variables());
    jest.advanceTimersByTime(1500);
  });
  expect(client.getQueryData<Post>(postKey)!.reaction_count).toBe(4);
  expect(refresh).not.toHaveBeenCalled();
});

test.each(['logout', 'switch'] as const)(
  'scheduled reaction refresh is abandoned on %s',
  async (scenario) => {
    seed();
    command.mockResolvedValue({ data: receipt('reaction'), error: null } as never);
    const { result } = setup();
    await act(async () => {
      await result.current.reaction.mutateAsync(variables());
    });
    mockState.session = scenario === 'logout' ? null : { user: { id: 'member-b' } };
    await act(async () => {
      jest.advanceTimersByTime(1500);
    });
    expect(refresh).not.toHaveBeenCalled();
  },
);

test('successive reaction results debounce the scoped reconciliation', async () => {
  seed();
  command.mockResolvedValue({ data: receipt('reaction'), error: null } as never);
  const { result } = setup();
  await act(async () => {
    await result.current.reaction.mutateAsync(variables());
    jest.advanceTimersByTime(1000);
  });
  await act(async () => {
    await result.current.reaction.mutateAsync({ ...variables(), active: true });
    jest.advanceTimersByTime(500);
  });
  expect(command).toHaveBeenLastCalledWith(
    'set_post_reaction',
    expect.objectContaining({ p_active: false }),
  );
  expect(refresh).not.toHaveBeenCalled();
  await act(async () => {
    jest.advanceTimersByTime(1000);
  });
  expect(refresh).toHaveBeenCalledTimes(1);
});

test.each(['add', 'delete', 'reaction'] as const)(
  '%s committed writes are not reported as failed when refresh fails',
  async (operation) => {
    seed();
    refresh.mockRejectedValueOnce(new Error('refresh offline'));
    command.mockResolvedValue({ data: receipt(operation), error: null } as never);
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const { result } = setup();
    await act(async () => {
      await result.current[operation].mutateAsync(variables());
      jest.advanceTimersByTime(1500);
    });
    expect(result.current[operation].isSuccess).toBe(true);
    expect(warning).toHaveBeenCalled();
  },
);

test.each([
  [{ ...post, my_reactions: ['heart'] }, 'fire', false, 3, { fire: 3 }, ['fire']],
  [{ ...post, my_reactions: ['fire'] }, 'heart', false, 3, { fire: 1, heart: 2 }, ['heart']],
  [
    { ...post, reaction_count: 1, reaction_breakdown: undefined, my_reactions: ['like'] },
    'fire',
    false,
    1,
    { fire: 1 },
    ['fire'],
  ],
  [{ ...post, my_reactions: ['fire'] }, 'fire', true, 2, { fire: 1, heart: 1 }, []],
  [
    { ...post, reaction_count: 0, reaction_breakdown: undefined, my_reactions: undefined },
    'wow',
    false,
    1,
    { wow: 1 },
    ['wow'],
  ],
  [
    { ...post, reaction_count: 0, reaction_breakdown: {}, my_reactions: [] },
    'fire',
    true,
    0,
    {},
    [],
  ],
] as const)(
  'actual reaction patch preserves one selection and nonnegative counts: %j',
  (original, emoji, active, count, breakdown, selected) => {
    const before = JSON.stringify(original);
    const patched = patchReactionToggle(original as unknown as Post, emoji, active);
    expect(patched).toMatchObject({
      reaction_count: count,
      reaction_breakdown: breakdown,
      my_reactions: selected,
    });
    expect(JSON.stringify(original)).toBe(before);
  },
);
