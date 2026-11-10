import { useCallback, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { focusManager, onlineManager, useQuery, useQueryClient } from '@tanstack/react-query';
import { captureProfileAccount, useAuthStore } from '../stores/useAuthStore';
import { commentScopeKey, type CommentWindow, type CommentScope } from '../lib/commentWindow';
import { readCommentWindow, type CommentReadIntent } from '../lib/commentWindowReads';
import { canKeepQueryDataOnError } from '../lib/queryDisplayState';

const canRead = () => focusManager.isFocused() && onlineManager.isOnline();
const subscribe = (notify: () => void) => {
  const focus = focusManager.subscribe(notify),
    online = onlineManager.subscribe(notify);
  return () => {
    focus();
    online();
  };
};

export function useCommentWindow(
  scopeInput: Omit<CommentScope, 'viewerId'>,
  enabled: boolean,
  budget?: { pageSize: number; maxPages: number; retainLoadedRoots?: boolean },
) {
  const client = useQueryClient();
  const viewerId = useAuthStore((state) => state.session?.user.id) ?? '';
  const { postId, audience, parentId } = scopeInput;
  const scope = useMemo(
    () => ({ postId, audience, parentId, viewerId }),
    [postId, audience, parentId, viewerId],
  );
  const key = useMemo(() => commentScopeKey(scope), [scope]);
  const available = useSyncExternalStore(subscribe, canRead, canRead);
  const intent = useRef<CommentReadIntent>('refresh');
  const visibleIds = useRef<ReadonlySet<string>>(new Set());
  const headRefreshAllowed = useRef(false);
  const pending = useRef(false);
  const [lastIntent, setLastIntent] = useState<CommentReadIntent>('refresh');
  const query = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) => {
      const account = captureProfileAccount();
      const readIntent = intent.current;
      setLastIntent(readIntent);
      intent.current = 'refresh';
      if (!account.isCurrent() || account.userId !== viewerId) throw new Error('Not authenticated');
      try {
        return await readCommentWindow({
          client,
          scope,
          intent: readIntent,
          signal,
          visibleIds: () => visibleIds.current,
          isCurrent: account.isCurrent,
          canReplaceHead: () => headRefreshAllowed.current,
          ...budget,
        });
      } catch (error) {
        if (
          !signal.aborted &&
          account.isCurrent() &&
          !canKeepQueryDataOnError(client.getQueryData(key), error)
        ) {
          // A subsequent transient failure must not resurrect data denied by this read.
          client.setQueryData<CommentWindow>(key, (old) =>
            old ? { ...old, pages: [], parentRow: undefined, revision: old.revision + 1 } : old,
          );
        }
        throw error;
      }
    },
    enabled: enabled && !!viewerId && available,
    gcTime: 0,
    staleTime: 20_000,
    retry: false,
  });
  const { refetch } = query;
  const load = useCallback(
    async (next: CommentReadIntent) => {
      if (
        !enabled ||
        !viewerId ||
        !canRead() ||
        pending.current ||
        client.isFetching({ queryKey: key, exact: true })
      )
        return;
      pending.current = true;
      intent.current = next;
      setLastIntent(next);
      try {
        await refetch({ cancelRefetch: false });
      } finally {
        pending.current = false;
        intent.current = 'refresh';
      }
    },
    [client, enabled, key, refetch, viewerId],
  );
  return { ...query, load, lastIntent, visibleIds, headRefreshAllowed, available };
}
