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
import { getEquippedBorder, getEquippedTitleLabel } from '@/lib/cosmetics';
import { ProfileShopEntry } from '@/components/economy/ProfileShopEntry';

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
  profile: Pick<
    Profile,
    | 'avatar_url'
    | 'username'
    | 'display_name'
    | 'bio'
    | 'level'
    | 'equipped_border_key'
    | 'equipped_title_key'
  >;
  avatarSize?: number;
  onChangePhoto?: () => void;
  photoUploading?: boolean;
  trailing?: React.ReactNode;
  style?: ViewStyle;
  showLevel?: boolean;
};

export function ProfileHeroRow({
  profile,
  avatarSize = 80,
  onChangePhoto,
  photoUploading,
  trailing,
  style,
  showLevel = true,
}: ProfileHeroRowProps) {
  const { colors } = useTheme();
  const border = getEquippedBorder(profile);
  const titleLabel = getEquippedTitleLabel(profile);

  return (
    <View style={[{ flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingHorizontal: Spacing.lg }, style]}>
      <View style={{ position: 'relative' }}>
        <Avatar
          uri={profile.avatar_url}
          username={profile.username}
          size={avatarSize}
          fallbackTone={profile.avatar_url ? 'default' : 'brand'}
          borderColor={border?.color}
          borderWidth={border?.width}
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
          {showLevel ? <LevelBadge level={profile.level ?? 1} /> : null}
          {trailing}
        </View>
        <Text variant="body" color={colors.textTertiary}>
          @{profile.username}
        </Text>
        {titleLabel ? (
          <View
            style={{
              alignSelf: 'flex-start',
              marginTop: 4,
              paddingHorizontal: Spacing.sm,
              paddingVertical: 3,
              borderRadius: Radius.full,
              borderWidth: 1,
              borderColor: colors.primary,
              backgroundColor: colors.surfaceElevated,
            }}
          >
            <Text variant="micro" color={colors.primary} style={{ fontWeight: '700' }}>
              {titleLabel}
            </Text>
          </View>
        ) : null}
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
  friendCount: number;
  responses: number;
  reactions: number;
  style?: ViewStyle;
  onPressFriends?: () => void;
};

export function ProfileStatsStrip({
  friendCount,
  responses,
  reactions,
  style,
  onPressFriends,
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
      <ProfileStatChip label="Friends" value={formatCompactCount(friendCount)} onPress={onPressFriends} />
      <ProfileStatChip label="Responses" value={formatCompactCount(responses)} />
      <ProfileStatChip label="Reactions" value={formatCompactCount(reactions)} />
    </View>
  );
}

type ProfileStreakPairProps = {
  currentStreak: number;
  bestStreak: number;
  style?: ViewStyle;
  sparks?: number;
  onPressShop?: () => void;
};

export function ProfileStreakPair({
  currentStreak,
  bestStreak,
  style,
  sparks,
  onPressShop,
}: ProfileStreakPairProps) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        streakRow: {
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
        sparksWrap: {
          marginHorizontal: Spacing.md,
          marginTop: Spacing.sm,
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
    <View style={[style]}>
      <View style={styles.streakRow}>
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
      {onPressShop != null && sparks != null ? (
        <View style={styles.sparksWrap}>
          <ProfileShopEntry amount={sparks} onPress={onPressShop} />
        </View>
      ) : null}
    </View>
  );
}
