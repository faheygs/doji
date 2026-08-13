import { QueryClient } from '@tanstack/react-query';
import {
  cancelScheduledInvalidations,
  invalidateQueryRoots,
  scheduleQueryInvalidation,
} from '../../lib/queryInvalidationBatcher';

describe('queryInvalidationBatcher', () => {
  afterEach(() => jest.useRealTimers());

  it('coalesces roots into one invalidation and does not cancel active reads', () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();

    scheduleQueryInvalidation(client, ['feed', 'pollResults']);
    scheduleQueryInvalidation(client, ['feed', 'comments']);
    jest.runAllTimers();

    expect(invalidate).toHaveBeenCalledTimes(1);
    const [filters, options] = invalidate.mock.calls[0];
    expect(options).toEqual({ cancelRefetch: false });
    expect(filters.refetchType).toBe('active');
    expect(filters.predicate?.({ queryKey: ['feed'] } as never)).toBe(true);
    expect(filters.predicate?.({ queryKey: ['leaderboard'] } as never)).toBe(false);
  });

  it('can be cancelled during teardown', () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
    scheduleQueryInvalidation(client, ['feed']);
    cancelScheduledInvalidations(client);
    jest.runAllTimers();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('does not repeat roots already covered by an immediate refresh', async () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
    scheduleQueryInvalidation(client, ['feed']);
    await invalidateQueryRoots(client, ['feed']);
    jest.runAllTimers();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('never overlaps realtime refreshes and catches up once after a burst', async () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    let finishFirst: (() => void) | undefined;
    const invalidate = jest.spyOn(client, 'invalidateQueries')
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve; }))
      .mockResolvedValue();

    scheduleQueryInvalidation(client, ['feed']);
    jest.advanceTimersByTime(80);
    expect(invalidate).toHaveBeenCalledTimes(1);

    scheduleQueryInvalidation(client, ['feed', 'comments']);
    jest.advanceTimersByTime(1_000);
    expect(invalidate).toHaveBeenCalledTimes(1);

    finishFirst?.();
    await Promise.resolve();
    jest.advanceTimersByTime(350);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
