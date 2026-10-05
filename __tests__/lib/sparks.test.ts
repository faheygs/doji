import {
  sparksForXp,
  sparksForLevel,
  sparksForBadgeTier,
  SPARKS_BUY_IN_COST,
} from '../../constants/sparks';

describe('sparks economy helpers', () => {
  it('sparksForXp rounds fifth of XP with minimum 1', () => {
    expect(sparksForXp(25)).toBe(5);
    expect(sparksForXp(1)).toBe(1);
    expect(sparksForXp(50)).toBe(10);
  });

  it('sparksForLevel scales with level', () => {
    expect(sparksForLevel(3)).toBe(15);
  });

  it('sparksForBadgeTier returns tier amounts', () => {
    expect(sparksForBadgeTier('gold')).toBe(30);
    expect(sparksForBadgeTier('unknown')).toBe(0);
  });

  it('buy-in cost is the most expensive spend', () => {
    expect(SPARKS_BUY_IN_COST).toBe(400);
  });
});
