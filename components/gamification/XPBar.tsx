import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { Typography, Spacing, Radius, xpToNextLevel } from '../../constants/theme';

type Props = {
  xp: number;
  level: number;
};

export function XPBar({ xp, level }: Props) {
  const { colors } = useTheme();
  const { current, max } = xpToNextLevel(xp, level);
  const pct = Math.min(1, max > 0 ? current / max : 1);

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={[Typography.micro, { color: colors.textSecondary }]}>
          {current} / {max} XP
        </Text>
        <Text style={[Typography.micro, { color: colors.textTertiary }]}>
          Level {level + 1}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.surfaceMuted }]}>
        <LinearGradient
          colors={[colors.xpGradientStart, colors.xpGradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.fill, { width: `${pct * 100}%` }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  track: {
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: Radius.full,
    minWidth: 4,
  },
});
