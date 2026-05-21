import React from 'react';
import { View, Text, StyleSheet, Platform, type TextStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { Radius } from '../../constants/theme';

type Props = {
  level: number;
  small?: boolean;
};

function levelNumberStyle(fontSize: number): TextStyle {
  return {
    fontSize,
    fontWeight: '800',
    letterSpacing: -0.2,
    ...(Platform.OS !== 'web' ? { fontVariant: ['tabular-nums'] } : {}),
  };
}

/** Minimal level chip: tracked “LV” + hairline + bold number (no emoji). */
export function LevelBadge({ level, small }: Props) {
  const { colors } = useTheme();
  const h = small ? 22 : 28;
  const px = small ? 10 : 14;
  const labelSize = small ? 9 : 10;
  const numSize = small ? 12 : 14;
  const ruleH = small ? 11 : 15;

  return (
    <LinearGradient
      colors={[colors.xpGradientStart, colors.xpGradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.pill, { height: h, paddingHorizontal: px, borderRadius: Radius.full }]}
    >
      <View style={styles.inner}>
        <Text
          style={[
            styles.label,
            {
              fontSize: labelSize,
              color: colors.onPrimary,
            },
          ]}
        >
          LV
        </Text>
        <View
          style={[
            styles.rule,
            {
              height: ruleH,
              backgroundColor: colors.onPrimary,
            },
          ]}
        />
        <Text style={[levelNumberStyle(numSize), { color: colors.onPrimary }]}>{level}</Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  label: {
    fontWeight: '700',
    letterSpacing: 1.4,
    opacity: 0.9,
  },
  rule: {
    width: 1,
    opacity: 0.42,
    borderRadius: 0.5,
  },
});
