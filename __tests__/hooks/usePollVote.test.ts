import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase');

describe('poll vote server contract', () => {
  const rpc = supabase.rpc as jest.Mock;

  afterEach(() => jest.clearAllMocks());

  it('uses the atomic submit_poll_vote RPC instead of direct table writes', async () => {
    rpc.mockResolvedValue({ data: { id: 'vote-1' }, error: null });
    const command = {
      p_user_event_id: 'event-abc',
      p_option_id: 'option-789',
      p_custom_text: null,
      p_idempotency_key: 'poll-vote:occurrence:event-abc',
    };

    const result = await rpc('submit_poll_vote', command);

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('submit_poll_vote', command);
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('returns the server error without starting a second write path', async () => {
    rpc.mockResolvedValue({ data: null, error: new Error('Doji has closed') });
    const result = await rpc('submit_poll_vote', {
      p_user_event_id: 'event-abc',
      p_option_id: 'option-789',
      p_custom_text: null,
      p_idempotency_key: 'poll-vote:occurrence:event-abc',
    });

    expect(result.error?.message).toBe('Doji has closed');
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
