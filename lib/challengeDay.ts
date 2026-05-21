/**
 * Local calendar day boundaries for matching `daily_events.fires_at`.
 * `start` / `end` are UTC ISO strings for the viewer’s local midnight → next midnight
 * (each device’s timezone; same calendar logic as yesterday/week ranges).
 */
export function todayFiresAtWindow(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** How many calendar days back the feed “Past 7 days” view includes (UI-only; DB untouched). */
export const FEED_HISTORY_VISIBLE_DAYS = 7;

/**
 * Local midnight-to-midnight window for the calendar day at `offsetFromToday`:
 * `0` = today, `1` = yesterday, etc.
 */
export function calendarDayWindow(offsetFromToday: number): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - offsetFromToday);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Inclusive range covering “past 7 days” = today through 6 days ago (local calendar). */
export function pastSevenDaysRange(): { start: string; end: string } {
  const oldest = calendarDayWindow(FEED_HISTORY_VISIBLE_DAYS - 1).start;
  const newestEnd = calendarDayWindow(0).end;
  return { start: oldest, end: newestEnd };
}

/**
 * YYYY-MM-DD for a calendar day in the device’s local timezone (not UTC).
 * Use for grouping and labels so “today” matches the viewer (e.g. 10pm MT vs midnight ET).
 */
export function localDateKeyFromDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DD in local time for an ISO instant (`fires_at`, `created_at`, etc.). */
export function localDateKeyFromIso(iso: string): string {
  return localDateKeyFromDate(new Date(iso));
}

/** Challenge drop is live for the viewer (feed + poll posts allowed). */
export function isChallengeLive(firesAt: string | null | undefined): boolean {
  if (!firesAt) return false;
  return new Date(firesAt).getTime() <= Date.now();
}
