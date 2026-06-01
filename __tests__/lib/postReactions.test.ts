import { attachReactionFields } from '../../lib/postReactions';
import { supabase } from '../../lib/supabase';

jest.mock('../../lib/supabase');

const mockFrom = supabase.from as jest.Mock;

function setupReactionsMock(reactions: { post_id: string; emoji: string; user_id: string }[]) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    in: jest.fn().mockResolvedValue({ data: reactions, error: null }),
  };
  mockFrom.mockReturnValue(chain);
}

describe('attachReactionFields', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns empty array for empty input', async () => {
    const result = await attachReactionFields([], 'user-1');
    expect(result).toEqual([]);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('attaches reaction_breakdown and my_reactions to posts', async () => {
    setupReactionsMock([
      { post_id: 'p1', emoji: 'fire', user_id: 'user-1' },
      { post_id: 'p1', emoji: 'fire', user_id: 'user-2' },
      { post_id: 'p1', emoji: 'heart', user_id: 'user-1' },
      { post_id: 'p2', emoji: 'wow', user_id: 'user-3' },
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
    setupReactionsMock([
      { post_id: 'p1', emoji: 'fire', user_id: 'user-1' },
    ]);

    const result = await attachReactionFields([{ id: 'p1' }], undefined);
    expect(result[0].my_reactions).toEqual([]);
  });

  it('throws when supabase returns an error', async () => {
    const chain = {
      select: jest.fn().mockReturnThis(),
      in: jest.fn().mockResolvedValue({ data: null, error: new Error('DB error') }),
    };
    mockFrom.mockReturnValue(chain);

    await expect(attachReactionFields([{ id: 'p1' }], 'user-1')).rejects.toThrow('DB error');
  });
});
