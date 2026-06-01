import { formatDistanceToNow, format, differenceInSeconds, isPast } from 'date-fns';

export function getTimeRemaining(expiresAt: string): number {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diff = differenceInSeconds(expiry, now);
  return Math.max(0, diff);
}

/** Positive = fires_at is in the future. Negative = fires_at has already passed. */
export function secondsUntilFiresAt(fires_at: string): number {
  return Math.floor((new Date(fires_at).getTime() - Date.now()) / 1000);
}

const BANNER_MAX_SECONDS = 10 * 60;

/** Feed banner: seconds until window ends (fires_at + min(window_minutes, 10)), never shows more than 10: worth of countdown. */
export function getBannerChallengeSecondsRemaining(
  dailyEvent: { fires_at: string; window_minutes: number } | null | undefined,
): number {
  if (!dailyEvent?.fires_at) return 0;
  const rawMins = dailyEvent.window_minutes;
  const minutes = Math.min(rawMins > 0 ? rawMins : 10, 10);
  const windowEndMs = new Date(dailyEvent.fires_at).getTime() + minutes * 60 * 1000;
  const rawSec = Math.floor((windowEndMs - Date.now()) / 1000);
  return Math.max(0, Math.min(rawSec, BANNER_MAX_SECONDS));
}

/** Countdown as m:ss only (never hours). */
export function formatMinutesSecondsCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0:00';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '0:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function formatRelativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

/** Shorter relative labels for tight UI rows (e.g. comment meta). */
export function formatCompactRelativeTime(dateString: string): string {
  const seconds = differenceInSeconds(new Date(), new Date(dateString));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes === 1 ? '1 min ago' : `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? '1 hr ago' : `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return days === 1 ? '1 day ago' : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return weeks === 1 ? '1 wk ago' : `${weeks} wk ago`;
  return format(new Date(dateString), 'MMM d');
}

export function isExpired(expiresAt: string): boolean {
  return isPast(new Date(expiresAt));
}

export function formatChallengeDate(dateString: string): string {
  return format(new Date(dateString), 'MMM d, yyyy');
}

export function getCompletionRate(completions: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((completions / total) * 100);
}

export function getLast90Days(): Date[] {
  const days: Date[] = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d);
  }
  return days;
}

export function formatDayKey(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}
