import { QueryClient } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { readCommentPage, readCommentWindow } from '../../lib/commentWindowReads';
import { commentScopeKey, patchCommentWindow, type CommentWindow } from '../../lib/commentWindow';
import { deferred, page, row, scope, windowData } from '../fixtures/commentWindow';

jest.mock('../../lib/supabase', () => ({ supabase: { rpc: jest.fn() } }));
const rpc = supabase.rpc as jest.Mock;
let client: QueryClient;
const key = commentScopeKey(scope);
const result = (data: unknown) => ({ data, error: null });
const respond = (data: unknown) =>
  rpc.mockReturnValueOnce({ abortSignal: () => Promise.resolve(result(data)) });
const read = (intent: 'refresh' | 'next' | 'previous' | 'latest' = 'refresh', options = {}) =>
  readCommentWindow({
    client,
    scope,
    intent,
    signal: new AbortController().signal,
    visibleIds: () => new Set(['two']),
    isCurrent: () => true,
    ...options,
  });
beforeEach(() => {
  jest.clearAllMocks();
  rpc.mockReset();
  client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
});
afterEach(() => client.clear());

test('initial reads are bounded, scoped and do not recursively drain pages', async () => {
  respond(page(['one', 'two']));
  const value = await read();
  expect(value.pages[0].items.map((item) => item.id)).toEqual(['one', 'two']);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith(
    'get_comment_page_v2',
    expect.objectContaining({
      p_limit: 50,
      p_post_id: 'post',
      p_audience: 'everyone',
      p_parent_id: null,
    }),
  );
});

test('refresh retains order, removes inaccessible rows and announces unseen head without inserting it', async () => {
  client.setQueryData(key, windowData());
  respond([row('two')]);
  respond(page(['new']));
  const value = await read();
  expect(value.pages[0].items.map((item) => item.id)).toEqual(['two']);
  expect(value.headChanged).toBe(true);
  expect(rpc.mock.calls[0]).toEqual([
    'get_comment_rows_v2',
    { p_post_id: 'post', p_ids: ['one', 'two'], p_audience: 'everyone' },
  ]);
  expect(rpc.mock.calls[1][1].p_limit).toBe(1);
});

test('refresh never reads more than five retained batches and a one-row head', async () => {
  const old = windowData();
  old.pages = Array.from({ length: 5 }, (_, n) =>
    page(Array.from({ length: 50 }, (_, i) => `${n}-${i}`)),
  );
  client.setQueryData(key, old);
  old.pages.forEach((item) => respond(item.items));
  respond(page(['0-0']));
  const value = await read();
  expect(value.pages.flatMap((item) => item.items)).toHaveLength(250);
  expect(rpc).toHaveBeenCalledTimes(6);
  expect(value.headChanged).toBe(false);
});

test('concurrent edits/hearts survive refresh while privacy removals still apply', async () => {
  client.setQueryData(key, windowData());
  const pending = deferred<ReturnType<typeof result>>();
  rpc.mockReturnValueOnce({ abortSignal: () => pending.promise });
  respond(page(['two']));
  const work = read();
  client.setQueryData<CommentWindow>(key, (old) =>
    patchCommentWindow(old!, 'two', (item) => ({
      ...item,
      body: 'newer edit',
      my_like: true,
      like_count: 1,
    })),
  );
  pending.resolve(result([row('two')]));
  const value = await work;
  expect(value.pages[0].items).toEqual([
    expect.objectContaining({ id: 'two', body: 'newer edit', my_like: true }),
  ]);
});

test('late pages cannot overwrite a newer mutation or a replaced window generation', async () => {
  client.setQueryData(key, windowData());
  const pending = deferred<ReturnType<typeof result>>();
  rpc.mockReturnValueOnce({ abortSignal: () => pending.promise });
  const work = read('next');
  const replaced = windowData(['replacement']);
  client.setQueryData(key, replaced);
  pending.resolve(result(page(['three'])));
  expect(await work).toEqual(replaced);
  const pending2 = deferred<ReturnType<typeof result>>();
  rpc.mockReturnValueOnce({ abortSignal: () => pending2.promise });
  const work2 = read('next');
  client.setQueryData<CommentWindow>(key, (old) => ({ ...old!, revision: 9 }));
  pending2.resolve(result(page(['four'])));
  expect((await work2).revision).toBe(9);
});

test('latest explicitly replaces a window; previous loads only the requested edge', async () => {
  const old = windowData();
  old.pages[0].previous = { id: 'one', createdAt: row('one').created_at };
  client.setQueryData(key, old);
  respond(page(['before']));
  const previous = await read('previous');
  expect(previous.pages).toHaveLength(2);
  respond(page(['latest']));
  const latest = await read('latest');
  expect(latest.pages).toHaveLength(1);
  expect(latest.generation).not.toBe(old.generation);
});

test('reply reads independently authorize their parent and latest uses the reply tail', async () => {
  respond([row('root')]);
  respond(page(['reply'], 'root'));
  const value = await read('latest', { scope: { ...scope, parentId: 'root' } });
  expect(value.parentRow?.id).toBe('root');
  expect(rpc.mock.calls[1][1]).toMatchObject({ p_parent_id: 'root', p_direction: 'previous' });
  respond([]);
  await expect(read('refresh', { scope: { ...scope, parentId: 'root' } })).rejects.toMatchObject({
    code: '42501',
  });
});

test('scope/account changes and cancellation cannot commit late results', async () => {
  await expect(read('refresh', { isCurrent: () => false })).rejects.toThrow('cancelled');
  const pending = deferred<ReturnType<typeof result>>();
  rpc.mockReturnValueOnce({ abortSignal: () => pending.promise });
  const controller = new AbortController();
  const work = read('refresh', { signal: controller.signal });
  controller.abort();
  await expect(work).rejects.toBeTruthy();
});

test.each([
  { items: [row('one')], previous: undefined, next: null },
  { ...page(['one']), items: [{ ...row('one'), post_id: 'other' }] },
  { ...page(['one']), items: Array.from({ length: 51 }, (_, i) => row(String(i))) },
])('invalid server page fails closed', async (bad) => {
  respond(bad);
  await expect(
    readCommentPage(scope, { direction: 'next', cursor: null }, new AbortController().signal),
  ).rejects.toThrow('Invalid');
});

test('malformed retained results and authorization errors fail the whole refresh', async () => {
  client.setQueryData(key, windowData());
  respond([row('unrequested')]);
  await expect(read()).rejects.toThrow('Invalid');
  rpc.mockReturnValueOnce({
    abortSignal: () =>
      Promise.resolve({ data: null, error: { code: '42501', message: 'denied' }, status: 403 }),
  });
  await expect(read()).rejects.toMatchObject({ code: '42501' });
});

test('absent edge does not fetch and a shared deadline bounds the whole refresh', async () => {
  const old = windowData();
  old.pages[0].next = null as never;
  client.setQueryData(key, old);
  expect(await read('next')).toEqual(old);
  expect(rpc).not.toHaveBeenCalled();
  jest.useFakeTimers();
  try {
    rpc.mockReturnValueOnce({ abortSignal: () => new Promise(() => {}) });
    const work = read();
    const assertion = expect(work).rejects.toMatchObject({ name: 'TimeoutError', message: 'Request timed out after 8000ms' });
    await jest.advanceTimersByTimeAsync(8001);
    await assertion;
  } finally {
    jest.useRealTimers();
  }
});
