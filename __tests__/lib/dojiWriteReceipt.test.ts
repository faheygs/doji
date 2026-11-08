import { getCommittedPostReceipt } from '../../lib/dojiWriteReceipt';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase');

afterEach(() => jest.useRealTimers());

describe('Doji write receipt reconciliation', () => {
  it('returns a committed post after an ambiguous RPC response', async () => {
    const post = { id: 'post-1', user_event_id: 'event-1' };
    const maybeSingle = jest.fn().mockResolvedValue({ data: post, error: null });
    const abortSignal = jest.fn().mockReturnValue({ maybeSingle });
    const eq = jest.fn().mockReturnValue({ abortSignal });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(getCommittedPostReceipt('event-1')).resolves.toEqual(post);
    expect(supabase.from).toHaveBeenCalledWith('posts');
    expect(eq).toHaveBeenCalledWith('user_event_id', 'event-1');
  });

  it('returns null when no committed receipt exists', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const abortSignal = jest.fn().mockReturnValue({ maybeSingle });
    const eq = jest.fn().mockReturnValue({ abortSignal });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(getCommittedPostReceipt('event-2')).resolves.toBeNull();
  });

  it('stops observing an ignored native abort without confirming or replaying a late receipt', async () => {
    jest.useFakeTimers();
    let resolve!: (value: unknown) => void;
    const maybeSingle = jest.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const abortSignal = jest.fn().mockReturnValue({ maybeSingle });
    (supabase.from as jest.Mock).mockReturnValue({
      select: () => ({ eq: () => ({ abortSignal }) }),
    });
    const result = jest.fn();
    void getCommittedPostReceipt('event-stalled').then(result);
    await jest.advanceTimersByTimeAsync(8_000);
    expect(result).toHaveBeenCalledWith(null);
    expect(abortSignal.mock.calls[0][0].aborted).toBe(true);
    resolve({ data: { id: 'late-post' }, error: null });
    await jest.advanceTimersByTimeAsync(0);
    expect(result).toHaveBeenCalledTimes(1);
    expect(maybeSingle).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('treats an unavailable receipt read as unknown, not successful submission', async () => {
    const maybeSingle = jest.fn().mockRejectedValue(Error('synthetic read unavailable'));
    (supabase.from as jest.Mock).mockReturnValue({
      select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle }) }) }),
    });
    await expect(getCommittedPostReceipt('event-unavailable')).resolves.toBeNull();
  });

  it('cannot accept a receipt arriving after suspension before the expired timer is delivered', async () => {
    jest.useFakeTimers();
    let resolve!: (value: unknown) => void;
    const maybeSingle = jest.fn().mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    (supabase.from as jest.Mock).mockReturnValue({
      select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle }) }) }),
    });
    const work = getCommittedPostReceipt('event-suspended');
    jest.setSystemTime(Date.now() + 8_001);
    resolve({ data: { id: 'late-post' }, error: null });
    await expect(work).resolves.toBeNull();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not sign a rejected receipt response', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: { code: 'denied' } });
    (supabase.from as jest.Mock).mockReturnValue({
      select: () => ({ eq: () => ({ abortSignal: () => ({ maybeSingle }) }) }),
    });
    await expect(getCommittedPostReceipt('event-denied')).resolves.toBeNull();
  });
});
