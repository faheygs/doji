import { InfiniteQueryObserver, QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  installInactiveQueryBudget, INACTIVE_QUERY_LIMIT, INACTIVE_PAGE_LIMIT,
  INACTIVE_PAGES_PER_QUERY,
} from '../../lib/inactiveQueryBudget';

const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const data = (count: number) => ({
  pages: Array.from({ length: count }, (_, i) => [i]),
  pageParams: Array.from({ length: count }, (_, i) => i),
});
let client: QueryClient;
let dispose: () => void;
const stops: (() => void)[] = [];
beforeEach(() => {
  client = new QueryClient({ defaultOptions: {
    queries: { retry: false, gcTime: Infinity, staleTime: Infinity },
    mutations: { retry: false, gcTime: Infinity },
  } });
  dispose = installInactiveQueryBudget(client);
});
afterEach(() => { dispose(); stops.splice(0).forEach(stop => stop()); client.clear(); });
function fill(count = INACTIVE_QUERY_LIMIT + 1) {
  for (let i = 0; i < count; i++) client.setQueryData(['profile', i], { id: i });
}
function observe(key: readonly unknown[], enabled = false) {
  const observer = new QueryObserver(client, { queryKey: key, enabled });
  const stop = observer.subscribe(() => {});
  stops.push(stop);
  return stop;
}

test('bounds unused query count by recency without serializing private payloads', async () => {
  fill(INACTIVE_QUERY_LIMIT);
  await flush();
  client.setQueryData(['profile', 0], { id: 0, toJSON: () => { throw Error('must not serialize'); } });
  client.setQueryData(['profile', INACTIVE_QUERY_LIMIT], { id: 'new' });
  await flush();
  expect(client.getQueryCache().getAll()).toHaveLength(INACTIVE_QUERY_LIMIT);
  expect(client.getQueryData(['profile', 0])).toBeDefined();
  expect(client.getQueryData(['profile', 1])).toBeUndefined();
});

test('evicts oldest whole queries when retained pages exceed the shared budget', async () => {
  const count = INACTIVE_PAGE_LIMIT / INACTIVE_PAGES_PER_QUERY + 1;
  for (let i = 0; i < count; i++) client.setQueryData(['comments', i], data(INACTIVE_PAGES_PER_QUERY));
  await flush();
  expect(client.getQueryData(['comments', 0])).toBeUndefined();
  expect(client.getQueryCache().getAll()).toHaveLength(count - 1);
  expect(client.getQueryData(['comments', count - 1])).toEqual(data(INACTIVE_PAGES_PER_QUERY));
});

test('mounted and disabled observers retain exact deep pages and cursors until the final detach', async () => {
  const key = ['feed', 'synthetic'];
  const original = data(20);
  client.setQueryData(key, original);
  const first = observe(key);
  const last = observe(key);
  await flush();
  expect(client.getQueryData(key)).toBe(original);
  first();
  await flush();
  expect(client.getQueryData(key)).toBe(original);
  last();
  await flush();
  expect(client.getQueryData(key)).toBeUndefined();
});

test('same-turn detach/reattach does not reset the viewport', async () => {
  const key = ['feed', 'synthetic'];
  client.setQueryData(key, data(20));
  const stop = observe(key);
  await flush();
  stop();
  observe(key);
  await flush();
  expect(client.getQueryData(key)).toEqual(data(20));
});

test('reopening an evicted infinite list reads only its initial page, never retained tail cursors', async () => {
  const key = ['comments', 'synthetic'];
  client.setQueryData(key, data(10));
  await flush();
  const read = jest.fn(async ({ pageParam }: { pageParam: number }) => [pageParam]);
  const observer = new InfiniteQueryObserver(client, {
    queryKey: key, queryFn: read, initialPageParam: 0,
    getNextPageParam: (_last, all) => all.length,
  });
  stops.push(observer.subscribe(() => {}));
  await flush();
  expect(read).toHaveBeenCalledTimes(1);
  expect(read.mock.calls[0][0].pageParam).toBe(0);
  expect(observer.getCurrentResult().data).toEqual(data(1));
});

test.each(['fetching', 'paused'] as const)('preserves %s work and prunes only after it settles', async fetchStatus => {
  const key = ['feed', 'synthetic'];
  client.setQueryData(key, data(20));
  const query = client.getQueryCache().find({ queryKey: key })!;
  query.setState({ fetchStatus });
  await flush();
  expect(client.getQueryData(key)).toBeDefined();
  query.setState({ fetchStatus: 'idle' });
  await flush();
  expect(client.getQueryData(key)).toBeUndefined();
});

test.each([false, true])('pending mutation protects rollback snapshots until settlement (failure=%s)', async failure => {
  let settle!: () => void;
  const work = new Promise<void>(resolve => { settle = resolve; });
  const mutation = client.getMutationCache().build(client, {
    mutationFn: async () => { await work; if (failure) throw Error('synthetic rejection'); },
  });
  const result = mutation.execute(undefined).catch(() => {});
  fill();
  client.setQueryData(['feed', 'snapshot'], data(20));
  await flush();
  expect(client.getQueryCache().getAll()).toHaveLength(INACTIVE_QUERY_LIMIT + 2);
  settle();
  await result;
  await flush();
  expect(client.getQueryData(['feed', 'snapshot'])).toBeUndefined();
  expect(client.getQueryCache().getAll()).toHaveLength(INACTIVE_QUERY_LIMIT);
});

test('does not evict unrelated private command/admin state or make new network requests', async () => {
  client.setQueryData(['adminCases'], data(50));
  client.setQueryData(['commandReceipt'], { uncertain: true });
  client.setQueryData(['feed', 'empty'], { pages: [], pageParams: [] });
  fill();
  await flush();
  expect(client.getQueryData(['adminCases'])).toEqual(data(50));
  expect(client.getQueryData(['commandReceipt'])).toEqual({ uncertain: true });
  expect(client.isFetching()).toBe(0);
});

test('account clear cannot be repopulated by a queued sweep; disposed subscriptions do nothing', async () => {
  fill();
  client.clear();
  await flush();
  expect(client.getQueryCache().getAll()).toHaveLength(0);
  fill();
  dispose();
  await flush();
  expect(client.getQueryCache().getAll()).toHaveLength(INACTIVE_QUERY_LIMIT + 1);
});

test('existing snapshots are bounded on installation, including deep and empty results', async () => {
  dispose();
  client.setQueryData(['feed', 'old-deep'], data(20));
  fill();
  client.setQueryData(['profile', 'missing'], null);
  dispose = installInactiveQueryBudget(client);
  await flush();
  expect(client.getQueryData(['feed', 'old-deep'])).toBeUndefined();
  expect(client.getQueryData(['profile', 'missing'])).toBeNull();
  expect(client.getQueryCache().getAll()).toHaveLength(INACTIVE_QUERY_LIMIT);
});
