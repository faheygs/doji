import { QueryClient } from '@tanstack/react-query';
import { preserveRecentReaction } from '../../lib/reactionReadConsistency';
import type { Post } from '../../types/database';

const incoming = {
  id: 'post',
  reaction_count: 1,
  my_reactions: [],
  comment_count: 9,
} as unknown as Post;
const selected = {
  ...incoming,
  reaction_count: 2,
  my_reactions: ['fire'],
  reaction_breakdown: { fire: 2 },
  comment_count: 1,
} as unknown as Post;
test('pending, pre-write and stale-cache reads cannot erase a tap; fresh reads still reconcile', () => {
  const client = new QueryClient({ defaultOptions: { mutations: { gcTime: Infinity } } });
  const mutation = client.getMutationCache().build(
    client,
    { mutationKey: ['toggleReaction', 'me'] },
    {
      status: 'pending',
      submittedAt: 100,
      variables: { postId: 'post' },
      context: {},
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      isPaused: false,
    },
  );
  expect(preserveRecentReaction(client, 'me', 110, incoming, selected)).toMatchObject({
    reaction_count: 2,
    my_reactions: ['fire'],
    comment_count: 9,
  });
  mutation.state.status = 'success';
  mutation.state.context = { reactionSettledAt: 200 };
  expect(preserveRecentReaction(client, 'me', 50, incoming, selected).reaction_count).toBe(2);
  expect(preserveRecentReaction(client, 'me', 1699, incoming, selected).reaction_count).toBe(2);
  expect(preserveRecentReaction(client, 'me', 1700, incoming, selected)).toBe(incoming);
  expect(preserveRecentReaction(client, 'other', 110, incoming, selected)).toBe(incoming);
  expect(
    preserveRecentReaction(client, 'me', 110, { ...incoming, id: 'other' }, selected)
      .reaction_count,
  ).toBe(1);
  expect(preserveRecentReaction(client, 'me', 110, incoming, undefined)).toBe(incoming);
  client.clear();
});
