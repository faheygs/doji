import React from 'react';
import { View, TouchableOpacity } from 'react-native';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useTheme } from '../../contexts/ThemeContext';
import { Spacing, BADGE_TIER_COLORS } from '../../constants/theme';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { IcnCrown } from '../icons/BadgeIcons';
import { getRankBorderColor } from '../../lib/rankTitle';
import { resolveAvatarBorderColor, resolveAvatarBorderWidth } from '../../lib/cosmetics';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
import type { LeaderboardEntry } from '../../types/database';
import {
  PODIUM_AVATAR_SIZES,
  usePodiumGhostStyles,
  usePodiumSlotStyles,
} from './usePodiumStyles';

function podiumColor(rank: 1 | 2 | 3): string {
  if (rank === 1) return BADGE_TIER_COLORS.gold;
  if (rank === 2) return BADGE_TIER_COLORS.silver;
  return BADGE_TIER_COLORS.bronze;
}

const PODIUM_ORDER = [2, 1, 3] as const;
const PODIUM_SHELL_MIN_HEIGHT = 248;

type PodiumSlotProps = {
  entry: LeaderboardEntry;
  currentUserId?: string;
};

function PodiumSlot({ entry, currentUserId }: PodiumSlotProps) {
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const rank = entry.rank as 1 | 2 | 3;
  const color = podiumColor(rank);
  const isMe = entry.user_id === currentUserId;
  const displayName =
    entry.profile.display_name || entry.profile.username || 'Player';
  const rankBorderColor = getRankBorderColor(entry.profile.level ?? 1, colors);

  const styles = usePodiumSlotStyles(colors, color, rank);

  const handlePress = () => {
    if (isMe) {
      router.push('/(app)/profile' as Href);
    } else if (entry.profile.username) {
      router.push(hrefWithReturnTo(`/(app)/member/${entry.profile.username}`, pathname));
    }
  };

  return (
    <TouchableOpacity
      style={styles.slot}
      onPress={handlePress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`${entry.profile.display_name || entry.profile.username}, rank ${rank}, ${entry.xp} XP`}
    >
      {rank === 1 ? <IcnCrown size={20} color={BADGE_TIER_COLORS.gold} /> : <View style={{ height: 20 }} />}
      <View style={styles.avatarWrap}>
        <Avatar
          uri={entry.profile.avatar_url}
          username={displayName}
          size={PODIUM_AVATAR_SIZES[rank]}
          borderColor={resolveAvatarBorderColor(entry.profile, rankBorderColor)}
          borderWidth={resolveAvatarBorderWidth(entry.profile)}
        />
        <View style={styles.rankBadge}>
          <Text variant="nano" style={styles.rankBadgeText}>
            {rank}
          </Text>
        </View>
      </View>
      <View style={styles.nameBlock}>
        <View style={styles.nameRow}>
          <Text variant="micro" numberOfLines={1} style={{ fontWeight: '700', textAlign: 'center' }}>
            {displayName}
          </Text>
          {isMe ? (
            <View style={styles.youPill}>
              <Text variant="nano" color={colors.primary} style={{ letterSpacing: 0.5 }}>
                YOU
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="nano" color={colors.textTertiary}>
          {entry.xp.toLocaleString()} XP
        </Text>
      </View>
      <View style={styles.block}>
        <Text variant="headingMedium" style={styles.blockRank}>
          {rank}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

function PodiumGhostSlot({ rank }: { rank: 1 | 2 | 3 }) {
  const { colors } = useTheme();
  const color = podiumColor(rank);

  const styles = usePodiumGhostStyles(colors, color, rank);

  return (
    <View style={styles.slot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {rank === 1 ? <View style={{ height: 20 }} /> : <View style={{ height: 20 }} />}
      <View style={styles.avatarPlaceholder} />
      <View style={styles.nameBlock}>
        <View style={styles.namePlaceholder} />
        <View style={styles.xpPlaceholder} />
      </View>
      <View style={styles.block}>
        <Text variant="headingMedium" style={styles.blockRank}>
          {rank}
        </Text>
      </View>
    </View>
  );
}

type PodiumTopThreeProps = {
  entries: LeaderboardEntry[];
  currentUserId?: string;
};

export function PodiumTopThree({ entries, currentUserId }: PodiumTopThreeProps) {
  const topThree = entries.filter((e) => e.rank <= 3);
  const byRank = new Map(topThree.map((e) => [e.rank, e]));

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: Spacing.sm,
        paddingHorizontal: Spacing.md,
        paddingTop: Spacing.md,
        minHeight: PODIUM_SHELL_MIN_HEIGHT,
      }}
    >
      {PODIUM_ORDER.map((rank) => {
        const entry = byRank.get(rank);
        if (entry) {
          return (
            <PodiumSlot key={entry.user_id} entry={entry} currentUserId={currentUserId} />
          );
        }
        return <PodiumGhostSlot key={`ghost-${rank}`} rank={rank} />;
      })}
    </View>
  );
}
