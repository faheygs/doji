import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Radius, Spacing, ACCENT_THEME_CATALOG, buildThemedColors, type AccentThemeKey } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { BORDER_CATALOG, TITLE_CATALOG } from '@/lib/cosmetics';
import type { ShopItem } from '@/types/database';
import type { Profile } from '@/types/database';

type ProfilePreview = Pick<Profile, 'avatar_url' | 'username' | 'display_name'> | null | undefined;

type Props = {
  item: ShopItem;
  profile?: ProfilePreview;
  size?: 'compact' | 'large';
};

function themeAccentHex(item: ShopItem): string {
  const fromCatalog = ACCENT_THEME_CATALOG[item.key as AccentThemeKey]?.color;
  return (item.metadata?.color as string | undefined) ?? fromCatalog ?? '#FF6B35';
}

function ThemeAccentPreview({
  accentHex,
  compact,
}: {
  accentHex: string;
  compact?: boolean;
}) {
  const { preference, colors: appColors } = useTheme();
  const themed = buildThemedColors(preference, accentHex);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        shell: {
          backgroundColor: themed.background,
          borderRadius: compact ? Radius.md : Radius.lg,
          borderWidth: 1,
          borderColor: themed.border,
          padding: compact ? Spacing.sm : Spacing.md,
          gap: compact ? 4 : Spacing.sm,
          width: compact ? 88 : '100%',
          overflow: 'hidden',
        },
        barPrimary: {
          height: compact ? 6 : 8,
          borderRadius: Radius.full,
          backgroundColor: themed.primary,
          width: compact ? '70%' : '55%',
        },
        barMuted: {
          height: compact ? 4 : 6,
          borderRadius: Radius.full,
          backgroundColor: themed.border,
          width: '85%',
        },
        button: {
          alignSelf: 'flex-start',
          paddingHorizontal: compact ? 8 : 12,
          paddingVertical: compact ? 4 : 6,
          borderRadius: Radius.full,
          backgroundColor: themed.primary,
        },
        buttonLine: {
          width: compact ? 20 : 28,
          height: compact ? 3 : 4,
          borderRadius: 2,
          backgroundColor: appColors.onPrimary,
        },
        dotRow: {
          flexDirection: 'row',
          gap: 4,
          marginTop: compact ? 0 : 2,
        },
        dot: {
          width: compact ? 6 : 8,
          height: compact ? 6 : 8,
          borderRadius: Radius.full,
          backgroundColor: themed.primary,
        },
        dotMuted: {
          backgroundColor: themed.border,
        },
      }),
    [themed, appColors.onPrimary, compact],
  );

  return (
    <View style={styles.shell}>
      <View style={styles.barPrimary} />
      <View style={styles.barMuted} />
      <View style={styles.button}>
        <View style={styles.buttonLine} />
      </View>
      {!compact ? (
        <View style={styles.dotRow}>
          <View style={styles.dot} />
          <View style={[styles.dot, styles.dotMuted]} />
          <View style={[styles.dot, styles.dotMuted]} />
        </View>
      ) : null}
    </View>
  );
}

function BorderFramePreview({
  item,
  profile,
  size,
}: {
  item: ShopItem;
  profile: ProfilePreview;
  size: 'compact' | 'large';
}) {
  const def = BORDER_CATALOG[item.key];
  const borderColor = def?.color ?? '#C0C0C0';
  const avatarSize = size === 'compact' ? 40 : 72;

  return (
    <Avatar
      username={profile?.username}
      uri={profile?.avatar_url}
      size={avatarSize}
      borderColor={borderColor}
      borderWidth={def?.width ?? 3}
    />
  );
}

function TitleBadgePreview({
  item,
  profile,
  size,
}: {
  item: ShopItem;
  profile: ProfilePreview;
  size: 'compact' | 'large';
}) {
  const { colors } = useTheme();
  const label = TITLE_CATALOG[item.key]?.label ?? item.name;
  const avatarSize = size === 'compact' ? 28 : 40;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          width: size === 'large' ? '100%' : undefined,
        },
        badge: {
          alignSelf: 'flex-start',
          paddingHorizontal: Spacing.sm,
          paddingVertical: size === 'compact' ? 2 : 4,
          borderRadius: Radius.full,
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: colors.surfaceElevated,
        },
      }),
    [colors, size],
  );

  return (
    <View style={styles.row}>
      <Avatar username={profile?.username} uri={profile?.avatar_url} size={avatarSize} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant={size === 'compact' ? 'micro' : 'label'} style={{ fontWeight: '700' }} numberOfLines={1}>
          {profile?.display_name ?? 'You'}
        </Text>
        <View style={styles.badge}>
          <Text variant="micro" color={colors.primary} style={{ fontWeight: '700' }}>
            {label}
          </Text>
        </View>
      </View>
    </View>
  );
}

export function ShopItemPreview({ item, profile, size = 'large' }: Props) {
  if (item.kind === 'theme') {
    return <ThemeAccentPreview accentHex={themeAccentHex(item)} compact={size === 'compact'} />;
  }
  if (item.kind === 'border') {
    return <BorderFramePreview item={item} profile={profile} size={size} />;
  }
  return <TitleBadgePreview item={item} profile={profile} size={size} />;
}
