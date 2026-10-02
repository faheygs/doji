import { createClient } from '@supabase/supabase-js';
import { QueryClient } from '@tanstack/react-query';
import { runMemberRead } from '../../lib/runMemberRead';
import { boundedSupabaseFetch } from '../../lib/supabaseFetch';
import { shouldRetryQuery } from '../../lib/apiRetry';

const originalFetch = global.fetch;
const NativeAbortController = require('abort-controller').AbortController;
const originalController = global.AbortController;

function sdk(accessToken: () => Promise<string> = async () => 'test-token') {
  return createClient('https://local.test', 'test-key', {
    accessToken,
    global: { fetch: boundedSupabaseFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

beforeEach(() => { global.AbortController = NativeAbortController; });
afterEach(() => { global.fetch = originalFetch; global.AbortController = originalController; jest.useRealTimers(); });

test.each(['network', '520'])('installed SDK cannot multiply the app retry budget for %s failures', async kind => {
  global.fetch = kind === 'network'
    ? jest.fn().mockRejectedValue(new TypeError('Network request failed'))
    : jest.fn().mockImplementation(async () => new Response('{}', { status: 520 }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: shouldRetryQuery, retryDelay: 1, gcTime: 0 } } });
  const db = sdk();
  try {
    await expect(client.fetchQuery({ queryKey: ['test'], queryFn: ({ signal }) => runMemberRead(db.from('records').select('id'), signal) })).rejects.toBeInstanceOf(Error);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  } finally { client.clear(); }
});

test('a stalled token lookup settles at the read deadline; releasing it cannot dispatch an expired request', async () => {
  jest.useFakeTimers();
  let release!: (token: string) => void;
  const db = sdk(() => new Promise(resolve => { release = resolve; }));
  global.fetch = jest.fn();
  const pending = runMemberRead(db.from('records').select('id'), undefined, 100).catch(error => error);
  await jest.advanceTimersByTimeAsync(100);
  expect(await pending).toMatchObject({ name: 'TimeoutError', abortSource: 'deadline', elapsedMs: 100 });
  expect(global.fetch).not.toHaveBeenCalled();
  release('late-token');
  await jest.advanceTimersByTimeAsync(0);
  expect(global.fetch).not.toHaveBeenCalled();
  expect(jest.getTimerCount()).toBe(0);
});

test('native cancellation remains attached after headers while PostgREST reads the body', async () => {
  jest.useFakeTimers();
  let bodyStarted = false;
  let transportSignal!: AbortSignal;
  global.fetch = jest.fn().mockImplementation(async (_input, init) => {
    transportSignal = init.signal;
    return { ok: true, status: 200, statusText: 'OK', headers: new Headers(),
      text: () => { bodyStarted = true; return new Promise((_resolve, reject) => {
        transportSignal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
      }); },
    };
  });
  const db = sdk();
  const pending = runMemberRead(db.from('records').select('id'), undefined, 100).catch(error => error);
  await jest.advanceTimersByTimeAsync(0);
  expect(bodyStarted).toBe(true);
  expect(transportSignal.aborted).toBe(false);
  await jest.advanceTimersByTimeAsync(100);
  expect(await pending).toMatchObject({ name: 'TimeoutError', abortSource: 'deadline' });
  expect(transportSignal.aborted).toBe(true);
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});

test('a body that ignores cancellation cannot keep the member read pending or cache a late result', async () => {
  jest.useFakeTimers();
  let release!: (body: string) => void;
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, headers: new Headers(),
    text: () => new Promise(resolve => { release = resolve; }),
  });
  const pending = runMemberRead(sdk().from('records').select('id'), undefined, 100).catch(error => error);
  await jest.advanceTimersByTimeAsync(100);
  const failure = await pending;
  expect(failure.name).toBe('TimeoutError');
  release('[{"id":"obsolete"}]');
  await jest.advanceTimersByTimeAsync(0);
  expect(await pending).toBe(failure);
  expect(jest.getTimerCount()).toBe(0);
});

test('pre-cancelled custom fetch never reaches native networking', async () => {
  global.fetch = jest.fn();
  const parent = new AbortController(); parent.abort();
  await expect(boundedSupabaseFetch('https://local.test', { signal: parent.signal })).rejects.toMatchObject({ name: 'AbortError' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('requests without a caller deadline retain their existing 15-second transport limit', async () => {
  jest.useFakeTimers();
  global.fetch = jest.fn().mockImplementation((_input, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  }));
  const pending = boundedSupabaseFetch('https://local.test').catch(error => error);
  await jest.advanceTimersByTimeAsync(15_000);
  expect(await pending).toMatchObject({ name: 'AbortError' });
  expect(global.fetch).toHaveBeenCalledTimes(1);
  expect(jest.getTimerCount()).toBe(0);
});
