import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../../contexts/ThemeContext';
import { Typography, Radius } from '../../constants/theme';

type Props = {
  level: number;
  small?: boolean;
};

export function LevelBadge({ level, small }: Props) {
  const { colors } = useTheme();
  const h = small ? 22 : 28;
  const px = small ? 8 : 12;
  const font = small ? Typography.nano : Typography.micro;

  return (
    <LinearGradient
      colors={[colors.xpGradientStart, colors.xpGradientEnd]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={[styles.pill, { height: h, paddingHorizontal: px, borderRadius: Radius.full }]}
    >
      <Text style={[font, { color: '#FFFFFF' }]}>⚡ Lvl {level}</Text>
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
});
