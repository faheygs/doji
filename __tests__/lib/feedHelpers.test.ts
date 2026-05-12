/**
 * Tests for feed utility functions defined in useFeed.ts.
 * todayRange is not exported, so we replicate the logic here.
 */

function todayRange() {
  const now = new Date();
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

describe('todayRange (UTC)', () => {
  it('returns ISO strings', () => {
    const { start, end } = todayRange();
    expect(start).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
    expect(end).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/);
  });

  it('start is midnight UTC', () => {
    const { start } = todayRange();
    const d = new Date(start);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
    expect(d.getUTCSeconds()).toBe(0);
    expect(d.getUTCMilliseconds()).toBe(0);
  });

  it('end is exactly 24 hours after start', () => {
    const { start, end } = todayRange();
    const diff = new Date(end).getTime() - new Date(start).getTime();
    expect(diff).toBe(24 * 60 * 60 * 1000);
  });

  it('start is today in UTC', () => {
    const { start } = todayRange();
    const now = new Date();
    const s = new Date(start);
    expect(s.getUTCFullYear()).toBe(now.getUTCFullYear());
    expect(s.getUTCMonth()).toBe(now.getUTCMonth());
    expect(s.getUTCDate()).toBe(now.getUTCDate());
  });
});

describe('patchReactionToggle (feed optimistic update logic)', () => {
  type ReactionBreakdown = Record<string, number>;
  type ReactionEmoji = string;
  type Post = {
    id: string;
    reaction_count: number;
    reaction_breakdown: ReactionBreakdown;
    my_reactions: ReactionEmoji[];
  };

  function patchReactionToggle(post: Post, emoji: ReactionEmoji, active: boolean): Post {
    const bd: Record<string, number> = { ...(post.reaction_breakdown ?? {}) };
    const myReactions = [...(post.my_reactions ?? [])];

    if (active) {
      bd[emoji] = Math.max(0, (bd[emoji] ?? 0) - 1);
      if (bd[emoji] <= 0) delete bd[emoji];
      const idx = myReactions.indexOf(emoji);
      if (idx >= 0) myReactions.splice(idx, 1);
      return {
        ...post,
        reaction_count: Math.max(0, post.reaction_count - 1),
        reaction_breakdown: bd,
        my_reactions: myReactions,
      };
    } else {
      bd[emoji] = (bd[emoji] ?? 0) + 1;
      myReactions.push(emoji);
      return {
        ...post,
        reaction_count: post.reaction_count + 1,
        reaction_breakdown: bd,
        my_reactions: myReactions,
      };
    }
  }

  const basePost: Post = {
    id: 'p1',
    reaction_count: 2,
    reaction_breakdown: { fire: 1, love: 1 },
    my_reactions: ['fire'],
  };

  it('adds a new reaction', () => {
    const result = patchReactionToggle(basePost, 'wow', false);
    expect(result.reaction_count).toBe(3);
    expect(result.reaction_breakdown.wow).toBe(1);
    expect(result.my_reactions).toContain('wow');
  });

  it('removes an existing reaction', () => {
    const result = patchReactionToggle(basePost, 'fire', true);
    expect(result.reaction_count).toBe(1);
    expect(result.reaction_breakdown.fire).toBeUndefined();
    expect(result.my_reactions).not.toContain('fire');
  });

  it('does not go below 0 reaction count', () => {
    const emptyPost: Post = {
      id: 'p2',
      reaction_count: 0,
      reaction_breakdown: {},
      my_reactions: [],
    };
    const result = patchReactionToggle(emptyPost, 'fire', true);
    expect(result.reaction_count).toBe(0);
  });

  it('increments existing emoji count', () => {
    const result = patchReactionToggle(basePost, 'fire', false);
    expect(result.reaction_breakdown.fire).toBe(2);
  });
});
