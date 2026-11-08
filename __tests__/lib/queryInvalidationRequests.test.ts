import { QueryClient, QueryObserver } from '@tanstack/react-query';
import {
  cancelScheduledInvalidations,
  scheduleQueryInvalidation,
} from '../../lib/queryInvalidationBatcher';

function deferred() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('realtime refresh request isolation', () => {
  let client: QueryClient;
  const unsubscribe: (() => void)[] = [];

  beforeEach(() => {
    jest.useFakeTimers({ now: 10_000 });
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } },
    });
  });

  afterEach(() => {
    unsubscribe.splice(0).forEach((stop) => stop());
    cancelScheduledInvalidations(client);
    client.clear();
    jest.useRealTimers();
  });

  function observe(root: string, read: () => Promise<string>, enabled = true) {
    const observer = new QueryObserver(client, {
      queryKey: [root, 'synthetic'],
      queryFn: read,
      initialData: 'cached',
      enabled,
    });
    unsubscribe.push(observer.subscribe(() => {}));
    return observer;
  }

  it('a mixed batch releases completed challenge reads independently of stalled comments', async () => {
    const comments = deferred();
    const readComments = jest
      .fn()
      .mockReturnValueOnce(comments.promise)
      .mockResolvedValue('comments');
    const readChallenge = jest.fn().mockResolvedValue('live');
    observe('comments', readComments);
    const challenge = observe('userEvent', readChallenge);

    scheduleQueryInvalidation(client, ['comments', 'userEvent']);
    await jest.advanceTimersByTimeAsync(80);
    expect(readComments).toHaveBeenCalledTimes(1);
    expect(readChallenge).toHaveBeenCalledTimes(1);
    expect(challenge.getCurrentResult().data).toBe('live');

    for (let i = 0; i < 100; i++) {
      scheduleQueryInvalidation(client, ['comments', 'userEvent']);
    }
    await jest.advanceTimersByTimeAsync(350);
    expect(readChallenge).toHaveBeenCalledTimes(2);
    expect(readComments).toHaveBeenCalledTimes(1);

    comments.resolve('comments');
    await jest.advanceTimersByTimeAsync(80);
    expect(readComments).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(10_000);
    expect(readComments).toHaveBeenCalledTimes(2);
    expect(readChallenge).toHaveBeenCalledTimes(2);
  });

  it('duplicate observers and hints do not multiply requests or fetch hidden/disabled families', async () => {
    const readFeed = jest.fn().mockResolvedValue('feed');
    const readHidden = jest.fn().mockResolvedValue('hidden');
    const readDisabled = jest.fn().mockResolvedValue('disabled');
    observe('feed', readFeed);
    observe('feed', readFeed);
    observe('disabled', readDisabled, false);
    await client.fetchQuery({ queryKey: ['hidden'], queryFn: readHidden });
    readHidden.mockClear();

    for (let i = 0; i < 100; i++) {
      scheduleQueryInvalidation(client, ['feed', 'hidden', 'disabled']);
    }
    await jest.advanceTimersByTimeAsync(80);
    expect(readFeed).toHaveBeenCalledTimes(1);
    expect(readHidden).not.toHaveBeenCalled();
    expect(readDisabled).not.toHaveBeenCalled();
    expect(client.getQueryState(['hidden'])?.isInvalidated).toBe(true);
  });

  it('separate clients never share a family wait', async () => {
    const other = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
    const stalled = deferred();
    observe('feed', () => stalled.promise);
    const otherRead = jest.fn().mockResolvedValue('other');
    const observer = new QueryObserver(other, {
      queryKey: ['feed'],
      queryFn: otherRead,
      initialData: 'cached',
      staleTime: Infinity,
    });
    const stop = observer.subscribe(() => {});
    try {
      scheduleQueryInvalidation(client, ['feed']);
      await jest.advanceTimersByTimeAsync(80);
      scheduleQueryInvalidation(other, ['feed']);
      await jest.advanceTimersByTimeAsync(80);
      expect(otherRead).toHaveBeenCalledTimes(1);
    } finally {
      stalled.resolve('done');
      stop();
      cancelScheduledInvalidations(other);
      other.clear();
    }
  });
});
