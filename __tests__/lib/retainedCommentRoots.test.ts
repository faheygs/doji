import { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import {
  acceptCommentPage,
  commentPageTicket,
  commentScopeKey,
  emptyCommentWindow,
} from '../../lib/commentWindow';
import { readCommentWindow } from '../../lib/commentWindowReads';
import { reconcileRetainedRoots, visibleRootPages } from '../../lib/retainedCommentRoots';
import { page, row, scope } from '../fixtures/commentWindow';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = jest.mocked(supabase.rpc);
const respond = (data: unknown) =>
  (rpc as jest.Mock).mockReturnValueOnce({
    abortSignal: () => Promise.resolve({ data, error: null }),
  });
beforeEach(() => jest.clearAllMocks());

test('downward paging retains all 121 loaded roots; returning to the top needs no previous cursor', () => {
  let window = { ...emptyCommentWindow(scope), retainLoadedRoots: true };
  const original = row('0');
  for (let offset = 0; offset < 121; offset += 20) {
    const incoming = page(
      Array.from({ length: Math.min(20, 121 - offset) }, (_, i) => String(offset + i)),
    );
    if (!offset) incoming.items[0] = original;
    const result = acceptCommentPage(
      window,
      commentPageTicket(window, 'next')!,
      incoming,
      new Set(['0']),
      3,
    );
    expect(result.status).toBe('accepted');
    expect(result.removedIds).toEqual([]);
    window = { ...result.window, retainLoadedRoots: true };
  }
  expect(window.pages.flatMap((p) => p.items)).toHaveLength(121);
  expect(window.pages[0].items[0]).toBe(original);
  expect(commentPageTicket(window, 'previous')).toBeNull();
});

test('100K loaded roots reconcile only visible pages; old rows stay available without a full-history refetch', async () => {
  const client = new QueryClient();
  const window = {
    ...emptyCommentWindow(scope),
    retainLoadedRoots: true,
    pages: Array.from({ length: 5000 }, (_, p) =>
      page(Array.from({ length: 20 }, (_, r) => `${p}-${r}`)),
    ),
  };
  client.setQueryData(commentScopeKey(scope), window);
  const visible = new Set(['4998-0', '4999-1']);
  const selected = visibleRootPages(window, visible);
  expect(selected).toHaveLength(2);
  respond(selected.flatMap((p) => p.items));
  respond(page(['0-0']));
  const options = {
    client,
    scope,
    signal: new AbortController().signal,
    visibleIds: () => visible,
    isCurrent: () => true,
  };
  const refreshed = await readCommentWindow({ ...options, intent: 'refresh' });
  expect(rpc).toHaveBeenCalledTimes(2);
  expect(rpc.mock.calls[0][1]).toMatchObject({
    p_ids: selected.flatMap((p) => p.items.map((r) => r.id)),
  });
  expect(refreshed.pages).toHaveLength(5000);
  expect(refreshed.pages[0].needsRefresh).toBe(true);
  expect(refreshed.pages.at(-1)?.needsRefresh).toBe(false);
  client.setQueryData(commentScopeKey(scope), refreshed);
  rpc.mockClear();
  respond(window.pages[0].items.slice(1));
  const top = await readCommentWindow({
    ...options,
    intent: 'visible',
    visibleIds: () => new Set(['0-0']),
  });
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc.mock.calls[0][0]).toBe('get_comment_rows_v2');
  expect(top.pages[0].items[0].id).toBe('0-1');
  expect(top.pages[0].needsRefresh).toBe(false);
  expect(top.pages.at(-1)?.needsRefresh).toBe(false);
  expect(top.pages[1].needsRefresh).toBe(true);
  client.clear();
});

test('empty viewports use a bounded initial refresh and malformed rows fail closed', () => {
  const window = {
    ...emptyCommentWindow(scope),
    retainLoadedRoots: true,
    pages: Array.from({ length: 10 }, (_, i) => page([String(i)])),
  };
  expect(visibleRootPages(window, new Set())).toHaveLength(3);
  expect(
    visibleRootPages(window, new Set(window.pages.flatMap((p) => p.items.map((r) => r.id)))),
  ).toHaveLength(3);
  expect(() =>
    reconcileRetainedRoots(
      window,
      [window.pages[0]],
      new Map([['0', { ...row('0'), parent_id: 'wrong' }]]),
      true,
    ),
  ).toThrow('Invalid root');
});

test('root retention is set only by the explicit root-reader option, never for replies', async () => {
  const client = new QueryClient();
  respond(page(['root']));
  const options = {
    client,
    scope,
    intent: 'refresh' as const,
    signal: new AbortController().signal,
    visibleIds: () => new Set<string>(),
    isCurrent: () => true,
    retainLoadedRoots: true,
  };
  expect((await readCommentWindow(options)).retainLoadedRoots).toBe(true);
  respond([row('root')]);
  respond(page(['reply'], 'root'));
  expect(
    (await readCommentWindow({ ...options, scope: { ...scope, parentId: 'root' } }))
      .retainLoadedRoots,
  ).toBe(false);
  client.clear();
});
