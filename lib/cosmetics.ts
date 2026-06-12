import type { Profile } from '../types/database';
import { BADGE_TIER_COLORS, type BadgeTierName } from '../constants/theme';

export type BorderDefinition = {
  key: string;
  color: string;
  width: number;
  label: string;
};

export type TitleDefinition = {
  key: string;
  label: string;
  tagline?: string;
};

/** Client mirror of shop title metadata — DB is source of truth for prices. */
export const TITLE_CATALOG: Record<string, TitleDefinition> = {
  title_early_bird: {
    key: 'title_early_bird',
    label: 'Chaos Agent',
    tagline: 'Zero chill. Maximum plot.',
  },
  title_streak_master: {
    key: 'title_streak_master',
    label: 'Main Character',
    tagline: 'The timeline bends around you.',
  },
  title_doji_og: {
    key: 'title_doji_og',
    label: 'Certified Delulu',
    tagline: 'Reality is a suggestion.',
  },
};

/** Client mirror of shop border metadata — DB is source of truth for prices. */
export const BORDER_CATALOG: Record<string, BorderDefinition> = {
  border_classic: { key: 'border_classic', color: '#C0C0C0', width: 3, label: 'Classic' },
  border_neon: { key: 'border_neon', color: '#FF6B35', width: 3, label: 'Neon' },
  border_gold: { key: 'border_gold', color: '#FFD700', width: 3, label: 'Gold' },
  border_diamond: { key: 'border_diamond', color: '#00D4FF', width: 3, label: 'Diamond' },
  border_purple: { key: 'border_purple', color: '#A855F7', width: 3, label: 'Purple' },
};

export function getEquippedBorder(
  profile: Pick<Profile, 'equipped_border_key'> | null | undefined,
): BorderDefinition | null {
  const key = profile?.equipped_border_key;
  if (!key) return null;
  return BORDER_CATALOG[key] ?? null;
}

export function getEquippedTitleLabel(
  profile: Pick<Profile, 'equipped_title_key'> | null | undefined,
): string | null {
  const key = profile?.equipped_title_key;
  if (!key) return null;
  return TITLE_CATALOG[key]?.label ?? null;
}

/** Cosmetic border wins over rank tier border when equipped. */
export function resolveAvatarBorderColor(
  profile: Pick<Profile, 'equipped_border_key'> | null | undefined,
  rankBorderColor?: string,
): string | undefined {
  const cosmetic = getEquippedBorder(profile);
  if (cosmetic) return cosmetic.color;
  return rankBorderColor;
}

export function resolveAvatarBorderWidth(
  profile: Pick<Profile, 'equipped_border_key'> | null | undefined,
): number {
  const cosmetic = getEquippedBorder(profile);
  return cosmetic?.width ?? 2.5;
}

export { BADGE_TIER_COLORS, type BadgeTierName };
