import { attachReactionFields } from '../../lib/postReactions';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase');

const mockRpc = supabase.rpc as jest.Mock;

function setupSummaryMock(
  summaries: Array<{
    post_id: string;
    reaction_breakdown: Record<string, number>;
    my_reactions: string[];
  }>,
) {
  mockRpc.mockResolvedValue({ data: summaries, error: null });
}

describe('attachReactionFields', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns empty array for empty input', async () => {
    const result = await attachReactionFields([], 'user-1');
    expect(result).toEqual([]);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('attaches reaction_breakdown and my_reactions to posts', async () => {
    setupSummaryMock([
      { post_id: 'p1', reaction_breakdown: { fire: 2, heart: 1 }, my_reactions: ['fire', 'heart'] },
      { post_id: 'p2', reaction_breakdown: { wow: 1 }, my_reactions: [] },
    ]);

    const posts = [{ id: 'p1' }, { id: 'p2' }];
    const result = await attachReactionFields(posts, 'user-1');

    expect(result).toHaveLength(2);
    expect(result[0].reaction_breakdown).toEqual({ fire: 2, heart: 1 });
    expect(result[0].my_reactions).toEqual(['fire', 'heart']);
    expect(result[1].reaction_breakdown).toEqual({ wow: 1 });
    expect(result[1].my_reactions).toEqual([]);
  });

  it('returns empty my_reactions when userId is undefined', async () => {
    setupSummaryMock([
      { post_id: 'p1', reaction_breakdown: { fire: 1 }, my_reactions: ['fire'] },
    ]);

    const result = await attachReactionFields([{ id: 'p1' }], undefined);
    expect(result[0].my_reactions).toEqual([]);
  });

  it('requests one bounded server aggregate for the visible posts', async () => {
    setupSummaryMock([]);
    await attachReactionFields([{ id: 'p1' }, { id: 'p2' }], 'user-1');
    expect(mockRpc).toHaveBeenCalledWith('get_post_reaction_summaries', {
      p_post_ids: ['p1', 'p2'],
    });
  });

  it('throws when supabase returns an error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: new Error('DB error') });

    await expect(attachReactionFields([{ id: 'p1' }], 'user-1')).rejects.toThrow('DB error');
  });
});
