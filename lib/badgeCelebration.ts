import type { BadgeTierName } from '../constants/theme';

const TIER_ORDER: BadgeTierName[] = ['bronze', 'silver', 'gold', 'diamond'];

export function tiersUnlockedUpTo(tier: BadgeTierName | string): BadgeTierName[] {
  const idx = TIER_ORDER.indexOf(tier as BadgeTierName);
  return idx >= 0 ? TIER_ORDER.slice(0, idx + 1) : [tier as BadgeTierName];
}

export function isBadgeTierUpgrade(
  oldTier: string | null | undefined,
  newTier: string | null | undefined,
): boolean {
  if (!newTier) return false;
  if (!oldTier) return true;
  const oldIdx = TIER_ORDER.indexOf(oldTier as BadgeTierName);
  const newIdx = TIER_ORDER.indexOf(newTier as BadgeTierName);
  if (oldIdx < 0 || newIdx < 0) return oldTier !== newTier;
  return newIdx > oldIdx;
}
