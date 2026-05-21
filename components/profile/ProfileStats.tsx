import React, { useMemo } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import type { Profile } from '@/types/database';

type Props = {
  profile: Profile;
  completionRate: number;
  /** Merged with the stats card container (e.g. adjust horizontal margins to match a parent section). */
  style?: StyleProp<ViewStyle>;
};

function StatCell({
  value,
  label,
  valueColor,
}: {
  value: string | number;
  label: string;
  valueColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <View style={statStyles.cell}>
      <Text variant="displayMedium" color={valueColor ?? colors.text} numberOfLines={1}>
        {value}
      </Text>
      <Text variant="label" color={colors.textSecondary} style={statStyles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  cell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xs,
  },
  label: {
    textAlign: 'center',
    lineHeight: 16,
  },
});

/** Two-by-two stats card — readable on narrow screens vs a single cramped row of four. */
export function ProfileStats({ profile, completionRate, style }: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          marginHorizontal: Spacing.lg,
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          marginBottom: Spacing.lg,
        },
        row: {
          flexDirection: 'row',
        },
        dividerH: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
        },
        dividerV: {
          width: StyleSheet.hairlineWidth,
          backgroundColor: colors.border,
        },
      }),
    [colors.surface, colors.border],
  );

  const rateColor = completionRate > 70 ? colors.success : completionRate > 40 ? colors.warning : colors.textSecondary;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.row}>
        <StatCell value={profile.current_streak} label="Current streak" />
        <View style={styles.dividerV} />
        <StatCell value={profile.longest_streak} label="Longest streak" />
      </View>
      <View style={styles.dividerH} />
      <View style={styles.row}>
        <StatCell value={profile.total_completions} label="Challenges done" />
        <View style={styles.dividerV} />
        <StatCell
          value={`${completionRate}%`}
          label="On-time rate"
          valueColor={profile.total_completions + profile.total_missed === 0 ? colors.textTertiary : rateColor}
        />
      </View>
    </View>
  );
}
