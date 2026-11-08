import { QueryClient } from '@tanstack/react-query';
import {
  cancelScheduledInvalidations,
  invalidateQueryRoots,
  scheduleQueryInvalidation,
} from '../../lib/queryInvalidationBatcher';

describe('queryInvalidationBatcher', () => {
  afterEach(() => jest.useRealTimers());

  it('coalesces each root once and does not cancel active reads', () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();

    scheduleQueryInvalidation(client, ['feed', 'pollResults']);
    scheduleQueryInvalidation(client, ['feed', 'comments']);
    jest.runAllTimers();

    expect(invalidate).toHaveBeenCalledTimes(3);
    const [filters, options] = invalidate.mock.calls[0];
    expect(options).toEqual({ cancelRefetch: false });
    expect(filters?.refetchType).toBe('active');
    expect(filters?.predicate?.({ queryKey: ['feed'] } as never)).toBe(true);
    expect(filters?.predicate?.({ queryKey: ['leaderboard'] } as never)).toBe(false);
    for (const root of ['feed', 'pollResults', 'comments']) {
      expect(
        invalidate.mock.calls.filter(([filter]) =>
          filter?.predicate?.({ queryKey: [root] } as never),
        ),
      ).toHaveLength(1);
    }
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

  it('immediate reads preserve unrelated pending roots and empty requests do nothing', async () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
    cancelScheduledInvalidations(client);
    await invalidateQueryRoots(client, []);
    scheduleQueryInvalidation(client, []);
    expect(invalidate).not.toHaveBeenCalled();
    await invalidateQueryRoots(client, ['profile']);
    scheduleQueryInvalidation(client, ['feed', 'comments']);
    await invalidateQueryRoots(client, ['feed', 'userEvent']);
    await invalidateQueryRoots(client, ['feed']);
    jest.advanceTimersByTime(80);
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(invalidate.mock.calls[3][0]?.predicate?.({ queryKey: ['comments'] } as never)).toBe(
      true,
    );
    expect(invalidate.mock.calls[3][0]?.predicate?.({ queryKey: [42] } as never)).toBe(false);
    await Promise.resolve();
    cancelScheduledInvalidations(client);
  });

  it('does not hold challenge updates behind an unrelated stalled refresh', async () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    let finishComments!: () => void;
    const invalidate = jest
      .spyOn(client, 'invalidateQueries')
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishComments = resolve;
          }),
      )
      .mockResolvedValue();

    scheduleQueryInvalidation(client, ['comments']);
    jest.advanceTimersByTime(80);
    scheduleQueryInvalidation(client, ['userEvent']);
    jest.advanceTimersByTime(80);
    const challengeStarted = invalidate.mock.calls.some(([filters]) =>
      filters?.predicate?.({ queryKey: ['userEvent'] } as never),
    );
    finishComments();
    await Promise.resolve();
    cancelScheduledInvalidations(client);

    expect(challengeStarted).toBe(true);
  });

  it('never overlaps the same family and catches up once after a burst', async () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    let finishFirst: (() => void) | undefined;
    const invalidate = jest
      .spyOn(client, 'invalidateQueries')
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirst = resolve;
          }),
      )
      .mockResolvedValue();

    scheduleQueryInvalidation(client, ['feed']);
    jest.advanceTimersByTime(80);
    expect(invalidate).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 100; i++) scheduleQueryInvalidation(client, ['feed']);
    jest.advanceTimersByTime(1_000);
    expect(invalidate).toHaveBeenCalledTimes(1);

    finishFirst?.();
    await Promise.resolve();
    jest.advanceTimersByTime(350);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('retains the minimum refresh gap per family, not globally', async () => {
    jest.useFakeTimers({ now: 0 });
    const client = new QueryClient();
    const invalidate = jest.spyOn(client, 'invalidateQueries').mockResolvedValue();
    scheduleQueryInvalidation(client, ['feed']);
    jest.advanceTimersByTime(80);
    await Promise.resolve();
    scheduleQueryInvalidation(client, ['feed', 'userEvent']);
    jest.advanceTimersByTime(80);
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(invalidate.mock.calls[1][0]?.predicate?.({ queryKey: ['userEvent'] } as never)).toBe(
      true,
    );
    jest.advanceTimersByTime(269);
    expect(invalidate).toHaveBeenCalledTimes(2);
    jest.advanceTimersByTime(1);
    expect(invalidate).toHaveBeenCalledTimes(3);
  });

  it('teardown fences old completions and a new account starts independently', async () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    let finishOld!: () => void;
    const invalidate = jest
      .spyOn(client, 'invalidateQueries')
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValue();
    scheduleQueryInvalidation(client, ['feed']);
    jest.advanceTimersByTime(80);
    scheduleQueryInvalidation(client, ['feed']);
    cancelScheduledInvalidations(client);
    scheduleQueryInvalidation(client, ['feed']);
    jest.advanceTimersByTime(80);
    expect(invalidate).toHaveBeenCalledTimes(2);
    finishOld();
    await Promise.resolve();
    jest.runAllTimers();
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('consumes rejected refreshes without automatic retries and permits a later hint', async () => {
    jest.useFakeTimers();
    const client = new QueryClient();
    const invalidate = jest
      .spyOn(client, 'invalidateQueries')
      .mockRejectedValueOnce(new Error('synthetic refresh failure'))
      .mockResolvedValue();
    scheduleQueryInvalidation(client, ['feed']);
    jest.advanceTimersByTime(80);
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    expect(invalidate).toHaveBeenCalledTimes(1);
    scheduleQueryInvalidation(client, ['feed']);
    jest.advanceTimersByTime(80);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
