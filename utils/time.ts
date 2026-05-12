import { formatDistanceToNow, format, differenceInSeconds, isPast } from 'date-fns';

export function getTimeRemaining(expiresAt: string): number {
  const expiry = new Date(expiresAt);
  const now = new Date();
  const diff = differenceInSeconds(expiry, now);
  return Math.max(0, diff);
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
