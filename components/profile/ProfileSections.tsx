import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ViewStyle } from 'react-native';
import { Spacing, Radius, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { IconCamera, IconChevronRight, IconReactionFire } from '@/components/icons/Icons';
import { formatCompactCount } from '@/utils/formatCount';
import type { Profile } from '@/types/database';

export function ProfileStatChip({
  label,
  value,
  onPress,
}: {
  label: string;
  value: string | number;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  const content = (
    <>
      <Text variant="displayMedium">{value}</Text>
      {onPress ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
          <Text variant="micro" color={colors.textTertiary}>
            {label}
          </Text>
          <IconChevronRight size={10} color={colors.textTertiary} />
        </View>
      ) : (
        <Text variant="micro" color={colors.textTertiary}>
          {label}
        </Text>
      )}
    </>
  );

  if (!onPress) {
    return <View style={{ alignItems: 'center', gap: 2, flex: 1 }}>{content}</View>;
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.65}
      accessibilityRole="button"
      accessibilityLabel={`View ${label.toLowerCase()}`}
      style={{ alignItems: 'center', gap: 2, flex: 1 }}
    >
      {content}
    </TouchableOpacity>
  );
}

type ProfileHeroRowProps = {
  profile: Pick<Profile, 'avatar_url' | 'username' | 'display_name' | 'bio' | 'level'>;
  avatarSize?: number;
  onChangePhoto?: () => void;
  photoUploading?: boolean;
  trailing?: React.ReactNode;
  style?: ViewStyle;
};

export function ProfileHeroRow({
  profile,
  avatarSize = 80,
  onChangePhoto,
  photoUploading,
  trailing,
  style,
}: ProfileHeroRowProps) {
  const { colors } = useTheme();

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.lg }, style]}>
      <View style={{ position: 'relative' }}>
        <Avatar
          uri={profile.avatar_url}
          username={profile.username}
          size={avatarSize}
          fallbackTone={profile.avatar_url ? 'default' : 'brand'}
        />
        {onChangePhoto ? (
          <TouchableOpacity
            onPress={onChangePhoto}
            disabled={photoUploading}
            accessibilityLabel="Change profile photo"
            style={{
              position: 'absolute',
              right: 0,
              bottom: 0,
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.primary,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: colors.background,
            }}
          >
            {photoUploading ? (
              <ActivityIndicator size="small" color={colors.onPrimary} />
            ) : (
              <IconCamera size={14} color={colors.onPrimary} />
            )}
          </TouchableOpacity>
        ) : null}
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' }}>
          <Text variant="headingLarge">{profile.display_name}</Text>
          <LevelBadge level={profile.level ?? 1} />
          {trailing}
        </View>
        <Text variant="body" color={colors.textTertiary}>
          @{profile.username}
        </Text>
        {profile.bio?.trim() ? (
          <Text variant="body" color={colors.textSecondary} style={{ lineHeight: 20, marginTop: 4 }}>
            {profile.bio.trim()}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

type ProfileStatsStripProps = {
  followers: number;
  following: number;
  responses: number;
  reactions: number;
  style?: ViewStyle;
  onPressFollowers?: () => void;
  onPressFollowing?: () => void;
};

export function ProfileStatsStrip({
  followers,
  following,
  responses,
  reactions,
  style,
  onPressFollowers,
  onPressFollowing,
}: ProfileStatsStripProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          marginHorizontal: Spacing.md,
          flexDirection: 'row',
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: Spacing.md,
          ...Shadows.card,
        },
      }),
    [colors],
  );

  return (
    <View style={[styles.card, style]}>
      <ProfileStatChip label="Followers" value={formatCompactCount(followers)} onPress={onPressFollowers} />
      <ProfileStatChip label="Following" value={formatCompactCount(following)} onPress={onPressFollowing} />
      <ProfileStatChip label="Responses" value={formatCompactCount(responses)} />
      <ProfileStatChip label="Reactions" value={formatCompactCount(reactions)} />
    </View>
  );
}

type ProfileStreakPairProps = {
  currentStreak: number;
  bestStreak: number;
  style?: ViewStyle;
};

export function ProfileStreakPair({ currentStreak, bestStreak, style }: ProfileStreakPairProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          marginHorizontal: Spacing.md,
          flexDirection: 'row',
          gap: Spacing.sm,
        },
        card: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: Spacing.md,
          gap: 4,
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          ...Shadows.card,
        },
        label: {
          textAlign: 'center',
        },
        valueRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        },
      }),
    [colors],
  );

  return (
    <View style={[styles.row, style]}>
      <View style={styles.card}>
        <Text variant="micro" color={colors.textSecondary} style={styles.label}>
          Current Streak
        </Text>
        <View style={styles.valueRow}>
          <Text variant="headingMedium" color={colors.primary}>
            {currentStreak}
          </Text>
          <IconReactionFire size={20} color={colors.primary} />
        </View>
      </View>
      <View style={styles.card}>
        <Text variant="micro" color={colors.textSecondary} style={styles.label}>
          Best Streak
        </Text>
        <Text variant="headingMedium" color={colors.xpGold} style={styles.label}>
          {bestStreak}
        </Text>
      </View>
    </View>
  );
}
