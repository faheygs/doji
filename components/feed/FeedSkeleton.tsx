import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Skeleton } from '../ui/Skeleton';

export function FeedSkeleton() {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: { padding: Spacing.md, gap: Spacing.md },
        card: {
          minHeight: 250,
          padding: Spacing.md,
          gap: Spacing.md,
          borderRadius: Radius.lg,
          backgroundColor: colors.surface,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
        textGroup: { flex: 1, gap: Spacing.xs },
      }),
    [colors],
  );

  return (
    <View
      style={styles.wrap}
      pointerEvents="none"
      accessibilityRole="progressbar"
      accessibilityLabel="Loading feed"
    >
      <View style={styles.card}>
        <View style={styles.row}>
          <Skeleton width={42} height={42} radius={21} />
          <View style={styles.textGroup}>
            <Skeleton width="38%" height={12} />
            <Skeleton width="24%" height={10} />
          </View>
        </View>
        <Skeleton height={120} radius={Radius.md} />
        <Skeleton width="62%" height={12} />
      </View>
    </View>
  );
}
