import type { AppColors } from '../constants/theme';

export type RankTier = {
  title: string;
  borderColor: (colors: AppColors) => string;
};

const TIERS: Array<{ minLevel: number } & RankTier> = [
  { minLevel: 15, title: 'Legend', borderColor: (c) => c.xpGradientStart },
  { minLevel: 10, title: 'Veteran', borderColor: (c) => c.warning },
  { minLevel: 6, title: 'Competitor', borderColor: (c) => c.accent },
  { minLevel: 3, title: 'Challenger', borderColor: (c) => c.primary },
  { minLevel: 1, title: 'Rookie', borderColor: (c) => c.border },
];

export function getRankTier(level: number): RankTier {
  return TIERS.find((t) => level >= t.minLevel) ?? TIERS[TIERS.length - 1];
}

export function getRankTitle(level: number): string {
  return getRankTier(level).title;
}

export function getRankBorderColor(level: number, colors: AppColors): string {
  return getRankTier(level).borderColor(colors);
}
