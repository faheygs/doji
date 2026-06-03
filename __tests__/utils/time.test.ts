import {
  parseDate,
  getTimeRemaining,
  secondsUntilFiresAt,
  getBannerChallengeSecondsRemaining,
  formatMinutesSecondsCountdown,
  formatCountdown,
  formatRelativeTime,
  formatCompactRelativeTime,
  isExpired,
  formatChallengeDate,
  getCompletionRate,
  getLast90Days,
  formatDayKey,
} from '../../utils/time';

// ---------------------------------------------------------------------------
// parseDate — the core Supabase timestamp normaliser
// ---------------------------------------------------------------------------
describe('parseDate', () => {
  it('parses standard ISO string with Z', () => {
    const d = parseDate('2026-06-02T12:00:00.000Z');
    expect(d.getTime()).toBe(new Date('2026-06-02T12:00:00.000Z').getTime());
  });

  it('parses Supabase space-separated format with +00', () => {
    const d = parseDate('2026-06-02 12:00:00+00');
    expect(d.getTime()).toBe(new Date('2026-06-02T12:00:00Z').getTime());
  });

  it('parses Supabase format with fractional seconds and +00', () => {
    const d = parseDate('2026-06-03 00:07:53.947+00');
    expect(d.getTime()).toBe(new Date('2026-06-03T00:07:53.947Z').getTime());
  });

  it('parses Supabase format with microseconds and +00', () => {
    const d = parseDate('2026-06-03 00:07:53.947497+00');
    expect(isNaN(d.getTime())).toBe(false);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(7);
  });

  it('treats no-timezone timestamp as UTC', () => {
    const d = parseDate('2026-06-02T12:00:00');
    expect(d.getTime()).toBe(new Date('2026-06-02T12:00:00Z').getTime());
  });

  it('treats space-separated no-timezone timestamp as UTC', () => {
    const d = parseDate('2026-06-02 12:00:00');
    expect(d.getTime()).toBe(new Date('2026-06-02T12:00:00Z').getTime());
  });

  it('preserves non-UTC offset (e.g. +09:00)', () => {
    const d = parseDate('2026-06-02T21:00:00+09:00');
    expect(d.getTime()).toBe(new Date('2026-06-02T12:00:00Z').getTime());
  });

  it('parses +00:00 offset', () => {
    const d = parseDate('2026-06-02T12:00:00+00:00');
    expect(d.getTime()).toBe(new Date('2026-06-02T12:00:00Z').getTime());
  });

  it('trims leading/trailing whitespace', () => {
    const d = parseDate('  2026-06-02T12:00:00Z  ');
    expect(d.getTime()).toBe(new Date('2026-06-02T12:00:00Z').getTime());
  });

  it('falls back gracefully for completely invalid input', () => {
    const d = parseDate('not-a-date');
    expect(isNaN(d.getTime())).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getTimeRemaining
// ---------------------------------------------------------------------------
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

  it('accepts Supabase format', () => {
    const future = '2099-01-01 00:00:00+00';
    expect(getTimeRemaining(future)).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// secondsUntilFiresAt
// ---------------------------------------------------------------------------
describe('secondsUntilFiresAt', () => {
  it('returns positive value for future fires_at', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(secondsUntilFiresAt(future)).toBeGreaterThan(0);
    expect(secondsUntilFiresAt(future)).toBeLessThanOrEqual(60);
  });

  it('returns negative value for past fires_at', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(secondsUntilFiresAt(past)).toBeLessThan(0);
  });

  it('accepts Supabase space format', () => {
    const past = '2020-01-01 00:00:00+00';
    expect(secondsUntilFiresAt(past)).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// getBannerChallengeSecondsRemaining
// ---------------------------------------------------------------------------
describe('getBannerChallengeSecondsRemaining', () => {
  it('returns 0 for null dailyEvent', () => {
    expect(getBannerChallengeSecondsRemaining(null)).toBe(0);
  });

  it('returns 0 for undefined dailyEvent', () => {
    expect(getBannerChallengeSecondsRemaining(undefined)).toBe(0);
  });

  it('returns 0 when fires_at is missing', () => {
    expect(getBannerChallengeSecondsRemaining({ fires_at: '', window_minutes: 10 })).toBe(0);
  });

  it('returns > 0 for a recently fired event within window', () => {
    const fires_at = new Date(Date.now() - 30_000).toISOString();
    const result = getBannerChallengeSecondsRemaining({ fires_at, window_minutes: 10 });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(600);
  });

  it('caps at 10 minutes (600s)', () => {
    const fires_at = new Date(Date.now() + 100).toISOString();
    const result = getBannerChallengeSecondsRemaining({ fires_at, window_minutes: 60 });
    expect(result).toBeLessThanOrEqual(600);
  });

  it('returns 0 when window has passed', () => {
    const fires_at = new Date(Date.now() - 20 * 60_000).toISOString();
    expect(getBannerChallengeSecondsRemaining({ fires_at, window_minutes: 10 })).toBe(0);
  });

  it('accepts Supabase format — recently fired challenge', () => {
    const fires_at = new Date(Date.now() - 30_000).toISOString().replace('T', ' ').replace('Z', '+00');
    const result = getBannerChallengeSecondsRemaining({ fires_at, window_minutes: 10 });
    expect(result).toBeGreaterThan(0);
    expect(result).toBeLessThanOrEqual(600);
  });
});

// ---------------------------------------------------------------------------
// formatMinutesSecondsCountdown
// ---------------------------------------------------------------------------
describe('formatMinutesSecondsCountdown', () => {
  it('returns 0:00 for 0 seconds', () => {
    expect(formatMinutesSecondsCountdown(0)).toBe('0:00');
  });

  it('returns 0:00 for negative seconds', () => {
    expect(formatMinutesSecondsCountdown(-10)).toBe('0:00');
  });

  it('formats 65 as 1:05', () => {
    expect(formatMinutesSecondsCountdown(65)).toBe('1:05');
  });

  it('formats 600 as 10:00', () => {
    expect(formatMinutesSecondsCountdown(600)).toBe('10:00');
  });

  it('formats 59 as 0:59', () => {
    expect(formatMinutesSecondsCountdown(59)).toBe('0:59');
  });

  it('formats 3600 (1 hour) as 60:00 (no hours column)', () => {
    expect(formatMinutesSecondsCountdown(3600)).toBe('60:00');
  });
});

// ---------------------------------------------------------------------------
// formatCountdown
// ---------------------------------------------------------------------------
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

  it('formats 3661 seconds with hours', () => {
    expect(formatCountdown(3661)).toBe('1:01:01');
  });

  it('formats 7200 seconds as 2:00:00', () => {
    expect(formatCountdown(7200)).toBe('2:00:00');
  });
});

// ---------------------------------------------------------------------------
// formatRelativeTime
// ---------------------------------------------------------------------------
describe('formatRelativeTime', () => {
  it('shows "about 1 hour ago" for 1h past', () => {
    const past = new Date(Date.now() - 60 * 60_000).toISOString();
    expect(formatRelativeTime(past)).toContain('hour');
  });

  it('accepts Supabase space format', () => {
    const past = new Date(Date.now() - 5 * 60_000).toISOString().replace('T', ' ').replace('Z', '+00');
    const result = formatRelativeTime(past);
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// formatCompactRelativeTime
// ---------------------------------------------------------------------------
describe('formatCompactRelativeTime', () => {
  it('returns "just now" for very recent timestamps', () => {
    const now = new Date().toISOString();
    expect(formatCompactRelativeTime(now)).toBe('just now');
  });

  it('returns minutes ago for recent past', () => {
    const recent = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatCompactRelativeTime(recent)).toBe('5 min ago');
  });

  it('returns "1 min ago" for exactly 1 minute', () => {
    const oneMin = new Date(Date.now() - 65_000).toISOString();
    expect(formatCompactRelativeTime(oneMin)).toBe('1 min ago');
  });

  it('returns hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    expect(formatCompactRelativeTime(twoHoursAgo)).toBe('2 hr ago');
  });

  it('returns "1 hr ago" for exactly 1 hour', () => {
    const oneHour = new Date(Date.now() - 61 * 60_000).toISOString();
    expect(formatCompactRelativeTime(oneHour)).toBe('1 hr ago');
  });

  it('returns days ago', () => {
    const threeDays = new Date(Date.now() - 3 * 24 * 60 * 60_000).toISOString();
    expect(formatCompactRelativeTime(threeDays)).toBe('3 days ago');
  });

  it('returns "1 day ago" for exactly 1 day', () => {
    const oneDay = new Date(Date.now() - 25 * 60 * 60_000).toISOString();
    expect(formatCompactRelativeTime(oneDay)).toBe('1 day ago');
  });

  it('returns weeks ago', () => {
    const twoWeeks = new Date(Date.now() - 14 * 24 * 60 * 60_000).toISOString();
    expect(formatCompactRelativeTime(twoWeeks)).toBe('2 wk ago');
  });

  it('returns month/day for old dates', () => {
    const old = '2020-01-15T00:00:00Z';
    expect(formatCompactRelativeTime(old)).toMatch(/Jan 1[45]/);
  });

  it('accepts Supabase space format without crashing', () => {
    const supabaseFormat = '2026-05-01 10:00:00+00';
    const result = formatCompactRelativeTime(supabaseFormat);
    expect(typeof result).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// isExpired
// ---------------------------------------------------------------------------
describe('isExpired', () => {
  it('returns true for past date', () => {
    expect(isExpired(new Date(Date.now() - 1000).toISOString())).toBe(true);
  });

  it('returns false for future date', () => {
    expect(isExpired(new Date(Date.now() + 60_000).toISOString())).toBe(false);
  });

  it('accepts Supabase space format — past', () => {
    expect(isExpired('2020-01-01 00:00:00+00')).toBe(true);
  });

  it('accepts Supabase space format — future', () => {
    expect(isExpired('2099-01-01 00:00:00+00')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// formatChallengeDate
// ---------------------------------------------------------------------------
describe('formatChallengeDate', () => {
  it('formats ISO string to readable date', () => {
    const result = formatChallengeDate('2026-05-12T00:00:00.000Z');
    expect(result).toMatch(/May 1[12], 2026/);
  });

  it('formats Supabase space format correctly', () => {
    const result = formatChallengeDate('2026-05-12 00:00:00+00');
    expect(result).toMatch(/May 1[12], 2026/);
  });

  it('does not throw for valid dates', () => {
    expect(() => formatChallengeDate('2026-01-01T00:00:00Z')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// getCompletionRate
// ---------------------------------------------------------------------------
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

  it('handles completions > total (defensive)', () => {
    expect(getCompletionRate(5, 3)).toBe(167);
  });
});

// ---------------------------------------------------------------------------
// getLast90Days
// ---------------------------------------------------------------------------
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

  it('first element is 89 days ago', () => {
    const days = getLast90Days();
    const first = days[0];
    const expected = new Date();
    expected.setDate(expected.getDate() - 89);
    expect(first.getDate()).toBe(expected.getDate());
  });

  it('days are in ascending order', () => {
    const days = getLast90Days();
    for (let i = 1; i < days.length; i++) {
      expect(days[i].getTime()).toBeGreaterThan(days[i - 1].getTime());
    }
  });
});

// ---------------------------------------------------------------------------
// formatDayKey
// ---------------------------------------------------------------------------
describe('formatDayKey', () => {
  it('formats date as yyyy-MM-dd', () => {
    const d = new Date(2026, 4, 12); // May 12, 2026
    expect(formatDayKey(d)).toBe('2026-05-12');
  });

  it('pads single-digit month and day', () => {
    const d = new Date(2026, 0, 1); // Jan 1, 2026
    expect(formatDayKey(d)).toBe('2026-01-01');
  });

  it('handles December correctly', () => {
    const d = new Date(2026, 11, 31); // Dec 31, 2026
    expect(formatDayKey(d)).toBe('2026-12-31');
  });
});
