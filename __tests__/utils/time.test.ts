import {
  getTimeRemaining,
  formatCountdown,
  isExpired,
  formatChallengeDate,
  getCompletionRate,
  getLast90Days,
  formatDayKey,
} from '../../utils/time';

describe('getTimeRemaining', () => {
  it('returns positive seconds for a future date', () => {
    const future = new Date(Date.now() + 120_000).toISOString();
    const remaining = getTimeRemaining(future);
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(120);
  });

  it('returns 0 for a past date', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(getTimeRemaining(past)).toBe(0);
  });

  it('returns 0 for now', () => {
    const now = new Date().toISOString();
    expect(getTimeRemaining(now)).toBe(0);
  });
});

describe('formatCountdown', () => {
  it('formats 0 seconds', () => {
    expect(formatCountdown(0)).toBe('0:00');
  });

  it('formats negative seconds as 0:00', () => {
    expect(formatCountdown(-5)).toBe('0:00');
  });

  it('formats 65 seconds as 1:05', () => {
    expect(formatCountdown(65)).toBe('1:05');
  });

  it('formats 600 seconds as 10:00', () => {
    expect(formatCountdown(600)).toBe('10:00');
  });

  it('formats 59 seconds as 0:59', () => {
    expect(formatCountdown(59)).toBe('0:59');
  });

  it('formats 3661 seconds as 61:01', () => {
    expect(formatCountdown(3661)).toBe('61:01');
  });
});

describe('isExpired', () => {
  it('returns true for past date', () => {
    expect(isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });

  it('returns false for future date', () => {
    expect(isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });
});

describe('formatChallengeDate', () => {
  it('formats ISO string to readable date', () => {
    const result = formatChallengeDate('2026-05-12T00:00:00.000Z');
    expect(result).toMatch(/May 1[12], 2026/);
  });
});

describe('getCompletionRate', () => {
  it('returns 0 when total is 0', () => {
    expect(getCompletionRate(0, 0)).toBe(0);
  });

  it('returns correct percentage', () => {
    expect(getCompletionRate(3, 4)).toBe(75);
  });

  it('returns 100 for perfect completion', () => {
    expect(getCompletionRate(10, 10)).toBe(100);
  });

  it('rounds to nearest integer', () => {
    expect(getCompletionRate(1, 3)).toBe(33);
  });
});

describe('getLast90Days', () => {
  it('returns exactly 90 dates', () => {
    expect(getLast90Days()).toHaveLength(90);
  });

  it('last element is today', () => {
    const days = getLast90Days();
    const today = new Date();
    const last = days[days.length - 1];
    expect(last.getDate()).toBe(today.getDate());
    expect(last.getMonth()).toBe(today.getMonth());
  });
});

describe('formatDayKey', () => {
  it('formats date as yyyy-MM-dd', () => {
    const d = new Date(2026, 4, 12); // May 12, 2026
    expect(formatDayKey(d)).toBe('2026-05-12');
  });
});
