import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { Image } from 'expo-image';
import { Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';

type Props = {
  uri?: string | null;
  username?: string;
  size?: number;
  /** Initials fallback: `brand` uses accent tint (e.g. profile hero). */
  fallbackTone?: 'default' | 'brand';
  style?: StyleProp<ViewStyle>;
  /** Optional rank-tier border color. Renders a colored ring around the avatar. */
  rankBorderColor?: string;
};

export function Avatar({ uri, username, size = 40, fallbackTone = 'default', style, rankBorderColor }: Props) {
  const { colors } = useTheme();
  const initials = username?.slice(0, 2).toUpperCase() ?? '??';

  const fallbackStyle = useMemo(() => {
    if (fallbackTone === 'brand') {
      return {
        backgroundColor: colors.accentGlow,
        borderWidth: 2,
        borderColor: `${colors.accent}33`,
      };
    }
    return {
      backgroundColor: colors.surfaceRaised,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    };
  }, [colors, fallbackTone]);

  const initialsColor = fallbackTone === 'brand' ? colors.accent : colors.textSecondary;
  const initialsFontSize = fallbackTone === 'brand' ? size * 0.36 : size * 0.32;

  const ringSize = size + 6;

  const inner = (
    <View style={[{ width: size, height: size }, styles.container, !rankBorderColor ? style : undefined]}>
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: size / 2 }}
          contentFit="cover"
          cachePolicy="memory-disk"
          recyclingKey={uri}
          transition={120}
        />
      ) : (
        <View style={[styles.fallbackBase, fallbackStyle, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text
            variant="label"
            color={initialsColor}
            style={{
              fontSize: initialsFontSize,
              fontWeight: fallbackTone === 'brand' ? '700' : '600',
              letterSpacing: fallbackTone === 'brand' ? -0.5 : 0,
            }}
          >
            {initials}
          </Text>
        </View>
      )}
    </View>
  );

  if (rankBorderColor) {
    return (
      <View
        style={[
          {
            width: ringSize,
            height: ringSize,
            borderRadius: ringSize / 2,
            borderWidth: 2.5,
            borderColor: rankBorderColor,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        {inner}
      </View>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radius.full,
    overflow: 'hidden',
  },
  fallbackBase: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
