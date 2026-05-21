import React from 'react';
import { View, Text, StyleSheet, Platform, type TextStyle } from 'react-native';
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

  const xpTextStyle: TextStyle[] = [
    Typography.micro,
    {
      color: colors.textSecondary,
      ...(Platform.OS !== 'web' ? { fontVariant: ['tabular-nums'] } : {}),
    },
  ];

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={xpTextStyle}>
          {current.toLocaleString()}
          <Text style={{ color: colors.textTertiary }}> / </Text>
          {max.toLocaleString()}
          <Text style={[Typography.nano, { color: colors.textTertiary, fontWeight: '600' }]}> XP</Text>
        </Text>
        <View style={styles.levelTag}>
          <Text style={[styles.lvMark, { color: colors.textTertiary }]}>LV</Text>
          <View style={[styles.lvRule, { backgroundColor: colors.textTertiary }]} />
          <Text
            style={[
              Typography.micro,
              {
                color: colors.textSecondary,
                fontWeight: '800',
                ...(Platform.OS !== 'web' ? { fontVariant: ['tabular-nums'] } : {}),
              },
            ]}
          >
            {level}
          </Text>
        </View>
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
    alignItems: 'center',
  },
  levelTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  lvMark: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
  },
  lvRule: {
    width: 1,
    height: 12,
    opacity: 0.45,
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
