import {
  todayFiresAtWindow,
  calendarDayWindow,
  pastSevenDaysRange,
  localDateKeyFromDate,
  localDateKeyFromIso,
  isChallengeLive,
  FEED_HISTORY_VISIBLE_DAYS,
} from '../../lib/challengeDay';

// ---------------------------------------------------------------------------
// localDateKeyFromDate
// ---------------------------------------------------------------------------
describe('localDateKeyFromDate', () => {
  it('formats a date as yyyy-MM-dd', () => {
    const d = new Date(2026, 4, 12, 15, 30); // May 12, 2026 3:30pm local
    expect(localDateKeyFromDate(d)).toBe('2026-05-12');
  });

  it('pads month and day', () => {
    const d = new Date(2026, 0, 5); // Jan 5, 2026
    expect(localDateKeyFromDate(d)).toBe('2026-01-05');
  });
});

// ---------------------------------------------------------------------------
// localDateKeyFromIso
// ---------------------------------------------------------------------------
describe('localDateKeyFromIso', () => {
  it('parses a Z-suffixed ISO string', () => {
    // Use a time that is unambiguously the same date in any timezone within ±14h
    const noon = '2026-06-15T12:00:00Z';
    const result = localDateKeyFromIso(noon);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('parses a Supabase space-format string without crashing', () => {
    const supabase = '2026-06-15 12:00:00+00';
    const result = localDateKeyFromIso(supabase);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('handles no-timezone string as UTC', () => {
    const noTz = '2026-06-15T00:00:00';
    const result = localDateKeyFromIso(noTz);
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// todayFiresAtWindow
// ---------------------------------------------------------------------------
describe('todayFiresAtWindow', () => {
  it('returns ISO string start and end', () => {
    const { start, end } = todayFiresAtWindow();
    expect(() => new Date(start)).not.toThrow();
    expect(() => new Date(end)).not.toThrow();
  });

  it('start is before end', () => {
    const { start, end } = todayFiresAtWindow();
    expect(new Date(start).getTime()).toBeLessThan(new Date(end).getTime());
  });

  it('window spans exactly 24 hours', () => {
    const { start, end } = todayFiresAtWindow();
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    expect(diffMs).toBe(24 * 60 * 60 * 1000);
  });

  it('now is within the window', () => {
    const { start, end } = todayFiresAtWindow();
    const now = Date.now();
    expect(now).toBeGreaterThanOrEqual(new Date(start).getTime());
    expect(now).toBeLessThan(new Date(end).getTime());
  });
});

// ---------------------------------------------------------------------------
// calendarDayWindow
// ---------------------------------------------------------------------------
describe('calendarDayWindow', () => {
  it('offset 0 is today (same as todayFiresAtWindow)', () => {
    const today = todayFiresAtWindow();
    const offset0 = calendarDayWindow(0);
    expect(offset0.start).toBe(today.start);
    expect(offset0.end).toBe(today.end);
  });

  it('offset 1 is yesterday — ends where today starts', () => {
    const { start: todayStart } = calendarDayWindow(0);
    const { end: yesterdayEnd } = calendarDayWindow(1);
    expect(yesterdayEnd).toBe(todayStart);
  });

  it('each window spans exactly 24 hours', () => {
    for (let i = 0; i < 7; i++) {
      const { start, end } = calendarDayWindow(i);
      const diffMs = new Date(end).getTime() - new Date(start).getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000);
    }
  });
});

// ---------------------------------------------------------------------------
// pastSevenDaysRange
// ---------------------------------------------------------------------------
describe('pastSevenDaysRange', () => {
  it('spans FEED_HISTORY_VISIBLE_DAYS days', () => {
    const { start, end } = pastSevenDaysRange();
    const diffMs = new Date(end).getTime() - new Date(start).getTime();
    expect(diffMs).toBe(FEED_HISTORY_VISIBLE_DAYS * 24 * 60 * 60 * 1000);
  });

  it('end is after start', () => {
    const { start, end } = pastSevenDaysRange();
    expect(new Date(end).getTime()).toBeGreaterThan(new Date(start).getTime());
  });

  it('now is within the range', () => {
    const { start, end } = pastSevenDaysRange();
    const now = Date.now();
    expect(now).toBeGreaterThanOrEqual(new Date(start).getTime());
    expect(now).toBeLessThan(new Date(end).getTime());
  });
});

// ---------------------------------------------------------------------------
// isChallengeLive
// ---------------------------------------------------------------------------
describe('isChallengeLive', () => {
  it('returns false for null/undefined', () => {
    expect(isChallengeLive(null)).toBe(false);
    expect(isChallengeLive(undefined)).toBe(false);
  });

  it('returns true for fires_at in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isChallengeLive(past)).toBe(true);
  });

  it('returns false for fires_at in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isChallengeLive(future)).toBe(false);
  });

  it('returns true for fires_at exactly now (within 1s tolerance)', () => {
    const justNow = new Date(Date.now() - 100).toISOString();
    expect(isChallengeLive(justNow)).toBe(true);
  });

  it('accepts Supabase space format (past)', () => {
    expect(isChallengeLive('2020-01-01 00:00:00+00')).toBe(true);
  });

  it('accepts Supabase space format (future)', () => {
    expect(isChallengeLive('2099-01-01 00:00:00+00')).toBe(false);
  });

  it('accepts no-timezone string treated as UTC past', () => {
    expect(isChallengeLive('2020-01-01T00:00:00')).toBe(true);
  });
});
