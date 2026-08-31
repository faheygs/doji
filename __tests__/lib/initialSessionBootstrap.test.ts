import type { Session } from '@supabase/supabase-js';
import {
  createInitialSessionBootstrap,
  observeSessionBootstrap,
} from '../../lib/initialSessionBootstrap';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('initial session bootstrap', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('shares one session restoration request across startup consumers', async () => {
    const pending = deferred<Session | null>();
    const loadSession = jest.fn(() => pending.promise);
    const bootstrap = createInitialSessionBootstrap(loadSession);

    const first = bootstrap.get();
    const second = bootstrap.get();

    expect(first).toBe(second);
    await Promise.resolve();
    expect(loadSession).toHaveBeenCalledTimes(1);

    pending.resolve(null);
    await expect(first).resolves.toBeNull();
  });

  it('releases the UI deadline but still recovers when the same request finishes', async () => {
    jest.useFakeTimers();
    const pending = deferred<Session | null>();
    const onSession = jest.fn();
    const onTimeout = jest.fn();

    observeSessionBootstrap(pending.promise, 8_000, {
      onSession,
      onTimeout,
      onError: jest.fn(),
    });

    jest.advanceTimersByTime(8_000);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onSession).not.toHaveBeenCalled();

    pending.resolve(null);
    await Promise.resolve();
    expect(onSession).toHaveBeenCalledWith(null);
  });

  it('allows a fresh request after a real restoration failure', async () => {
    const first = deferred<Session | null>();
    const loadSession = jest
      .fn<Promise<Session | null>, []>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce(null);
    const bootstrap = createInitialSessionBootstrap(loadSession);

    const failed = bootstrap.get();
    first.reject(new Error('storage failed'));
    await expect(failed).rejects.toThrow('storage failed');
    await Promise.resolve();

    await expect(bootstrap.get()).resolves.toBeNull();
    expect(loadSession).toHaveBeenCalledTimes(2);
  });
});
