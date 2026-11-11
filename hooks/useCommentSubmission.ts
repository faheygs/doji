import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';
import { createOptimisticComment } from '../lib/commentOptimism';
import { filterContent } from '../lib/contentFilter';
import { newCommandId } from '../lib/idempotency';
import type { Comment } from '../types/database';
import type { FeedAudience } from '../lib/feedAudience';
import type { AddCommentVars, useAddComment } from './useAddComment';

export type CommentSubmission = {
  key: string;
  variables: AddCommentVars;
  row: Comment;
  state: 'sending' | 'unconfirmed' | 'rejected' | 'confirmed';
  account: ReturnType<typeof captureProfileAccount>;
};
const EMPTY: CommentSubmission[] = [];
const unresolved = (entry: CommentSubmission) =>
  entry.state === 'sending' || entry.state === 'unconfirmed';

/** Memory-only recovery, not an offline queue: only a tap starts or retries a write. */
export function useCommentSubmission(
  postId: string,
  audience: FeedAudience,
  mutation: ReturnType<typeof useAddComment>,
) {
  const client = useQueryClient();
  const session = useAuthStore((s) => s.session);
  const uid = session?.user.id;
  const key = useMemo(() => ['commentSubmission', uid, postId] as const, [uid, postId]);
  const query = useQuery<CommentSubmission[]>({
    queryKey: key,
    queryFn: () => EMPTY,
    initialData: EMPTY,
    enabled: false,
    gcTime: Infinity,
  });
  const current = useCallback(
    () =>
      (client.getQueryData<CommentSubmission[]>(key) ?? EMPTY).filter((entry) =>
        entry.account.isCurrent(),
      ),
    [client, key],
  );
  useEffect(
    () => () => {
      const cached = client.getQueryCache().find({ queryKey: key, exact: true });
      if ((cached?.getObserversCount() ?? 0) > 1) return;
      const recovery = current().filter((entry) => entry.state !== 'confirmed');
      if (recovery.length) client.setQueryData(key, recovery);
      else client.removeQueries({ queryKey: key, exact: true });
    },
    [client, current, key],
  );
  const update = (entry: CommentSubmission) => {
    if (!entry.account.isCurrent()) return;
    if (
      entry.state === 'confirmed' &&
      !client.getQueryCache().find({ queryKey: key, exact: true })?.getObserversCount()
    ) {
      const remaining = current().filter((item) => item.key !== entry.key);
      if (remaining.length) client.setQueryData(key, remaining);
      else client.removeQueries({ queryKey: key, exact: true });
      return;
    }
    client.setQueryData<CommentSubmission[]>(key, [
      ...current().filter((item) => item.key !== entry.key),
      entry,
    ]);
  };
  const send = (entry: CommentSubmission) => {
    update({ ...entry, state: 'sending' });
    void mutation
      .mutateAsync(entry.variables)
      .then((row) => {
        if (!row?.id) throw new Error('Comment receipt missing');
        update({
          ...entry,
          state: 'confirmed',
          row: { ...row, profile: entry.row.profile, my_like: false },
        });
      })
      .catch((error: unknown) => {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        update({
          ...entry,
          state:
            typeof code === 'string' && ['P0001', '23505', '23514', '22023', '42501'].includes(code)
              ? 'rejected'
              : 'unconfirmed',
        });
      });
  };
  const entries = useMemo(
    () =>
      (query.data ?? EMPTY).filter(
        (entry) => entry.account.isCurrent() && entry.account.userId === session?.user.id,
      ),
    [query.data, session],
  );
  const acknowledge = useCallback(
    (ids: ReadonlySet<string>) => {
      const existing = current();
      const next = existing.filter(
        (entry) => entry.state !== 'confirmed' || !ids.has(entry.row.id),
      );
      if (next.length !== existing.length) client.setQueryData(key, next);
    },
    [client, current, key],
  );
  return {
    entries,
    busy: entries.some(unresolved),
    submit(body: string, parentId: string | null, replyToCommentId: string | null) {
      const account = captureProfileAccount();
      if (!uid || account.userId !== uid || !account.isCurrent() || current().some(unresolved))
        return false;
      if (!body.trim() || !filterContent(body.trim()).ok) return false;
      const commandId = newCommandId('comment');
      const variables = Object.freeze({
        postId,
        body: body.trim(),
        parentId,
        replyToCommentId,
        feedAudience: audience,
        commandId,
        account,
      });
      const profile = useAuthStore.getState().profile;
      send({
        key: commandId,
        variables,
        account,
        state: 'sending',
        row: createOptimisticComment({
          postId,
          userId: uid,
          body: variables.body,
          parentId,
          replyToCommentId,
          commandId,
          profile: profile?.id === uid ? profile : undefined,
        }),
      });
      return commandId;
    },
    retry(commandId: string) {
      const entry = current().find(
        (item) => item.key === commandId && item.state === 'unconfirmed',
      );
      if (entry) send(entry);
    },
    dismiss(commandId: string) {
      client.setQueryData(
        key,
        current().filter((entry) => entry.key !== commandId || entry.state !== 'rejected'),
      );
    },
    acknowledge,
  };
}
