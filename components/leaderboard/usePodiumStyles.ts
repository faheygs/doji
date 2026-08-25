import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Radius } from '../../constants/theme';
import type { AppColors } from '../../constants/theme';

type PodiumRank = 1 | 2 | 3;
export const PODIUM_AVATAR_SIZES: Record<PodiumRank, number> = { 1: 50, 2: 42, 3: 42 };
const PODIUM_BLOCK_HEIGHTS: Record<PodiumRank, number> = { 1: 130, 2: 100, 3: 80 };

export function usePodiumSlotStyles(colors: AppColors, color: string, rank: PodiumRank) {
  return useMemo(
    () =>
      StyleSheet.create({
        slot: { flex: 1, alignItems: 'center', gap: 6 },
        avatarWrap: { position: 'relative' },
        rankBadge: {
          position: 'absolute',
          bottom: -4,
          right: -4,
          width: 18,
          height: 18,
          borderRadius: 9,
          backgroundColor: color,
          borderWidth: 2,
          borderColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        },
        rankBadgeText: {
          fontSize: 9,
          fontWeight: '800',
          color: rank === 2 ? '#FFFFFF' : '#000',
        },
        nameBlock: {
          alignItems: 'center',
          gap: 2,
          paddingHorizontal: 2,
          minHeight: 32,
        },
        nameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
        block: {
          width: '100%',
          height: PODIUM_BLOCK_HEIGHTS[rank],
          backgroundColor: `${color}30`,
          borderWidth: 2,
          borderColor: color,
          borderBottomWidth: 0,
          borderTopLeftRadius: Radius.sm,
          borderTopRightRadius: Radius.sm,
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 6,
        },
        blockRank: { fontSize: 16, fontWeight: '900', color },
        youPill: {
          paddingHorizontal: 6,
          paddingVertical: 1,
          borderRadius: Radius.full,
          backgroundColor: colors.primaryPale,
        },
      }),
    [colors, color, rank],
  );
}

export function usePodiumGhostStyles(colors: AppColors, color: string, rank: PodiumRank) {
  return useMemo(
    () =>
      StyleSheet.create({
        slot: { flex: 1, alignItems: 'center', gap: 6 },
        avatarPlaceholder: {
          width: PODIUM_AVATAR_SIZES[rank],
          height: PODIUM_AVATAR_SIZES[rank],
          borderRadius: PODIUM_AVATAR_SIZES[rank] / 2,
          backgroundColor: colors.surfaceMuted,
          borderWidth: 1,
          borderColor: colors.border,
        },
        namePlaceholder: {
          width: '70%',
          height: 10,
          borderRadius: 4,
          backgroundColor: colors.surfaceMuted,
        },
        xpPlaceholder: {
          width: '50%',
          height: 8,
          borderRadius: 4,
          backgroundColor: colors.surfaceMuted,
        },
        nameBlock: { alignItems: 'center', gap: 4, minHeight: 32 },
        block: {
          width: '100%',
          height: PODIUM_BLOCK_HEIGHTS[rank],
          backgroundColor: `${color}12`,
          borderWidth: 1,
          borderColor: `${color}40`,
          borderBottomWidth: 0,
          borderTopLeftRadius: Radius.sm,
          borderTopRightRadius: Radius.sm,
          alignItems: 'center',
          justifyContent: 'flex-start',
          paddingTop: 6,
        },
        blockRank: { fontSize: 16, fontWeight: '900', color: `${color}80` },
      }),
    [colors, color, rank],
  );
}
