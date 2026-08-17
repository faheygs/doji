import { getCommittedPostReceipt } from '../../lib/dojiWriteReceipt';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase');

describe('Doji write receipt reconciliation', () => {
  it('returns a committed post after an ambiguous RPC response', async () => {
    const post = { id: 'post-1', user_event_id: 'event-1' };
    const maybeSingle = jest.fn().mockResolvedValue({ data: post, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(getCommittedPostReceipt('event-1')).resolves.toEqual(post);
    expect(supabase.from).toHaveBeenCalledWith('posts');
    expect(eq).toHaveBeenCalledWith('user_event_id', 'event-1');
  });

  it('returns null when no committed receipt exists', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    const eq = jest.fn().mockReturnValue({ maybeSingle });
    const select = jest.fn().mockReturnValue({ eq });
    (supabase.from as jest.Mock).mockReturnValue({ select });

    await expect(getCommittedPostReceipt('event-2')).resolves.toBeNull();
  });
});
