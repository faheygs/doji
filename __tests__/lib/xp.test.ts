import { levelFromXp, xpForNextLevel, xpProgress, weekStart } from '../../lib/xp';

describe('levelFromXp', () => {
  it('returns level 1 for 0 XP', () => {
    expect(levelFromXp(0)).toBe(1);
  });

  it('returns level 1 for XP below level 2 threshold', () => {
    expect(levelFromXp(499)).toBe(1);
  });

  it('returns level 2 at exactly 500 XP', () => {
    expect(levelFromXp(500)).toBe(2);
  });

  it('returns level 3 at 1200 XP', () => {
    expect(levelFromXp(1200)).toBe(3);
  });

  it('returns level 10 at 16000 XP', () => {
    expect(levelFromXp(16000)).toBe(10);
  });

  it('returns level 10 for XP beyond max threshold', () => {
    expect(levelFromXp(999999)).toBe(10);
  });

  it('returns level 1 for negative XP', () => {
    expect(levelFromXp(-100)).toBe(1);
  });
});

describe('xpForNextLevel', () => {
  it('returns threshold for level 2 when at level 1', () => {
    expect(xpForNextLevel(1)).toBe(500);
  });

  it('returns threshold for level 3 when at level 2', () => {
    expect(xpForNextLevel(2)).toBe(1200);
  });

  it('returns max threshold when at max level', () => {
    expect(xpForNextLevel(10)).toBe(16000);
  });
});

describe('xpProgress', () => {
  it('returns 0 progress at start of level 1', () => {
    const result = xpProgress(0, 1);
    expect(result.current).toBe(0);
    expect(result.max).toBe(500);
    expect(result.percent).toBe(0);
  });

  it('returns 50% progress at 250 XP level 1', () => {
    const result = xpProgress(250, 1);
    expect(result.current).toBe(250);
    expect(result.max).toBe(500);
    expect(result.percent).toBe(0.5);
  });

  it('clamps percent to 1', () => {
    const result = xpProgress(999999, 10);
    expect(result.percent).toBe(1);
  });

  it('handles level 2 progress correctly', () => {
    const result = xpProgress(850, 2);
    expect(result.current).toBe(350); // 850 - 500
    expect(result.max).toBe(700);     // 1200 - 500
  });
});

describe('weekStart', () => {
  it('returns a yyyy-MM-dd string', () => {
    expect(weekStart()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a Monday', () => {
    const ws = weekStart();
    const d = new Date(ws + 'T00:00:00Z');
    // getUTCDay: 0=Sun, 1=Mon
    expect(d.getUTCDay()).toBe(1);
  });
});
