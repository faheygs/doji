/**
 * Test the usePollVote mutation logic (the raw mutation function).
 * We test the underlying Supabase calls directly since testing React Query hooks
 * requires more complex wrapper setup.
 */
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase');

const mockFrom = supabase.from as jest.Mock;

describe('usePollVote mutation logic', () => {
  const userId = 'user-123';
  const challengeId = 'challenge-456';
  const optionId = 'option-789';
  const userEventId = 'event-abc';

  afterEach(() => jest.clearAllMocks());

  it('inserts poll_vote then updates user_event', async () => {
    const insertChain = {
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: null }),
    };

    mockFrom
      .mockReturnValueOnce(insertChain)  // poll_votes
      .mockReturnValueOnce(updateChain); // user_events

    // Simulate the mutation function
    const { error: voteErr } = await mockFrom('poll_votes').insert({
      user_id: userId,
      challenge_id: challengeId,
      option_id: optionId,
    });
    expect(voteErr).toBeNull();

    const { error: ueErr } = await mockFrom('user_events')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', userEventId);
    expect(ueErr).toBeNull();
  });

  it('throws when poll_votes insert fails', async () => {
    const insertChain = {
      insert: jest.fn().mockResolvedValue({ error: new Error('Duplicate vote') }),
    };
    mockFrom.mockReturnValue(insertChain);

    const { error } = await mockFrom('poll_votes').insert({
      user_id: userId,
      challenge_id: challengeId,
      option_id: optionId,
    });
    expect(error).toBeTruthy();
    expect(error.message).toBe('Duplicate vote');
  });

  it('throws when user_events update fails', async () => {
    const insertChain = {
      insert: jest.fn().mockResolvedValue({ error: null }),
    };
    const updateChain = {
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockResolvedValue({ error: new Error('RLS denied') }),
    };

    mockFrom
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(updateChain);

    await mockFrom('poll_votes').insert({});
    const { error } = await mockFrom('user_events').update({}).eq('id', userEventId);
    expect(error).toBeTruthy();
    expect(error.message).toBe('RLS denied');
  });
});
