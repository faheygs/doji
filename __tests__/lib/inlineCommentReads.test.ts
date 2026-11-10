import { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { readCommentWindow, type CommentReadIntent } from '../../lib/commentWindowReads';
import { commentScopeKey, type CommentScope } from '../../lib/commentWindow';
import { page, row, scope, windowData } from '../fixtures/commentWindow';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;
let client: QueryClient;
const respond = (data: unknown) =>
  rpc.mockReturnValueOnce({ abortSignal: () => Promise.resolve({ data, error: null }) });
const read = (
  owner: CommentScope,
  intent: CommentReadIntent,
  visible = new Set<string>(),
  budget = { pageSize: 10, maxPages: 3 },
) =>
  readCommentWindow({
    client,
    scope: owner,
    intent,
    visibleIds: () => visible,
    isCurrent: () => true,
    signal: new AbortController().signal,
    ...budget,
  });
beforeEach(() => {
  rpc.mockReset();
  client = new QueryClient();
});
afterEach(() => client.clear());

test('new reply tail appends to existing inline rows instead of jumping to a separate newest page', async () => {
  const owner = { ...scope, parentId: 'root' };
  const old = windowData(['old-reply'], owner);
  old.pages[0].next = null;
  old.headChanged = true;
  client.setQueryData(commentScopeKey(owner), old);
  respond([row('root')]);
  respond({ ...page(['new-reply'], 'root'), next: null });
  const result = await read(owner, 'tail', new Set(['old-reply']));
  expect(result.pages.flatMap((p) => p.items.map((item) => item.id))).toEqual([
    'old-reply',
    'new-reply',
  ]);
  expect(result.generation).toBe(old.generation);
  expect(result.headChanged).toBe(false);
  expect(rpc.mock.calls[1][1]).toMatchObject({
    p_direction: 'next',
    p_cursor_id: 'old-reply',
    p_limit: 10,
  });
});

test('first reply after an empty thread starts at its chronological beginning', async () => {
  const owner = { ...scope, parentId: 'root' };
  client.setQueryData(commentScopeKey(owner), windowData([], owner));
  respond([row('root')]);
  respond({ ...page(['first'], 'root'), next: null });
  const result = await read(owner, 'latest');
  expect(result.pages[0].items[0].id).toBe('first');
  expect(rpc.mock.calls[1][1]).toMatchObject({ p_direction: 'next', p_cursor_id: null });
});

test('small retained pages refresh in one bounded ID batch, not one call per small page', async () => {
  const owner = { ...scope, parentId: 'root' };
  const old = windowData([], owner);
  old.pages = Array.from({ length: 3 }, (_, p) =>
    page(
      Array.from({ length: 10 }, (_, n) => `${p}-${n}`),
      'root',
    ),
  );
  client.setQueryData(commentScopeKey(owner), old);
  respond([row('root')]);
  respond(old.pages.flatMap((p) => p.items));
  respond(page(['2-9'], 'root'));
  const result = await read(owner, 'refresh');
  expect(result.pages).toHaveLength(3);
  expect(result.headChanged).toBe(false);
  expect(rpc).toHaveBeenCalledTimes(3);
  expect(rpc.mock.calls[1][1].p_ids).toHaveLength(30);
});

test('inline page eviction refuses a visible edge and enforces the smaller retained bound', async () => {
  const old = windowData();
  old.pages = [page(['a']), page(['b']), page(['c'])];
  client.setQueryData(commentScopeKey(scope), old);
  respond(page(['d']));
  expect((await read(scope, 'next', new Set(['a']))).pages).toHaveLength(3);
  respond(page(['d']));
  expect(
    (await read(scope, 'next', new Set(['c']))).pages.flatMap((p) =>
      p.items.map((item) => item.id),
    ),
  ).toEqual(['b', 'c', 'd']);
});

test('scrolling away during a head read keeps the retained viewport instead of replacing it', async () => {
  const old = windowData(['retained']);
  old.headChanged = true;
  client.setQueryData(commentScopeKey(scope), old);
  respond(page(['new']));
  const result = await readCommentWindow({
    client,
    scope,
    intent: 'latest',
    visibleIds: () => new Set(['retained']),
    isCurrent: () => true,
    canReplaceHead: () => false,
    signal: new AbortController().signal,
  });
  expect(result).toBe(client.getQueryData(commentScopeKey(scope)));
  expect(result.pages[0].items[0].id).toBe('retained');
});

test('an already reconciled reply tail does not add an empty page or discard rows', async () => {
  const owner = { ...scope, parentId: 'root' };
  const old = windowData(['kept'], owner);
  old.pages[0].next = null;
  old.headChanged = true;
  client.setQueryData(commentScopeKey(owner), old);
  respond([row('root')]);
  respond({ items: [], previous: null, next: null });
  const result = await read(owner, 'tail');
  expect(result.pages).toEqual(old.pages);
  expect(result.headChanged).toBe(false);
});

test.each([
  { pageSize: 0, maxPages: 3 },
  { pageSize: 51, maxPages: 3 },
  { pageSize: 10, maxPages: 6 },
])('invalid budgets fail before transport: %j', async (budget) => {
  await expect(read(scope, 'refresh', new Set(), budget)).rejects.toThrow(
    'Invalid comment window budget',
  );
  expect(rpc).not.toHaveBeenCalled();
});
