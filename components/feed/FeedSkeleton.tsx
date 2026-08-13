import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';

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
        avatar: {
          width: 42,
          height: 42,
          borderRadius: 21,
          backgroundColor: colors.surfaceMuted,
        },
        textGroup: { flex: 1, gap: Spacing.xs },
        line: {
          height: 12,
          borderRadius: Radius.full,
          backgroundColor: colors.surfaceMuted,
        },
        content: {
          flex: 1,
          minHeight: 120,
          borderRadius: Radius.md,
          backgroundColor: colors.surfaceMuted,
        },
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
          <View style={styles.avatar} />
          <View style={styles.textGroup}>
            <View style={[styles.line, { width: '38%' }]} />
            <View style={[styles.line, { width: '24%' }]} />
          </View>
        </View>
        <View style={styles.content} />
        <View style={[styles.line, { width: '62%' }]} />
      </View>
    </View>
  );
}
