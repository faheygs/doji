import { XP_LEVELS } from '../constants/theme';

export function levelFromXp(xp: number): number {
  for (let i = XP_LEVELS.length - 1; i >= 0; i--) {
    if (xp >= XP_LEVELS[i]) return i + 1;
  }
  return 1;
}

export function xpForNextLevel(currentLevel: number): number {
  if (currentLevel >= XP_LEVELS.length) return XP_LEVELS[XP_LEVELS.length - 1];
  return XP_LEVELS[currentLevel]; // 0-indexed: level 1 needs XP_LEVELS[1] to reach level 2
}

export function xpProgress(xp: number, level: number): { current: number; max: number; percent: number } {
  const thisLevelXp = level <= 1 ? 0 : XP_LEVELS[level - 1];
  const nextLevelXp = level >= XP_LEVELS.length ? XP_LEVELS[XP_LEVELS.length - 1] : XP_LEVELS[level];
  const max = nextLevelXp - thisLevelXp;
  const current = xp - thisLevelXp;
  return { current, max, percent: max > 0 ? Math.min(1, current / max) : 1 };
}

export function weekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const diff = (day + 6) % 7; // Mon=0
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() - diff);
  monday.setUTCHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}
