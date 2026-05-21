import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { getRankTitle, getRankBorderColor } from '@/lib/rankTitle';

type Props = {
  level: number;
  /** Smaller pill to pair with `LevelBadge small` */
  small?: boolean;
};

/**
 * Tier label (Rookie, Challenger, …) as a bordered pill — pairs visually with {@link LevelBadge}.
 */
export function RankBadge({ level, small }: Props) {
  const { colors } = useTheme();
  const title = getRankTitle(level);
  const borderColor = getRankBorderColor(level, colors);

  return (
    <View
      style={[
        styles.wrap,
        small ? styles.wrapSmall : styles.wrapDefault,
        {
          borderColor,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <Text
        variant={small ? 'nano' : 'micro'}
        style={{
          color: borderColor,
          fontWeight: '800',
          letterSpacing: 0.6,
        }}
        numberOfLines={1}
      >
        {title.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'center',
    borderRadius: Radius.full,
    borderWidth: 1.5,
  },
  wrapDefault: {
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: 6,
    minHeight: 28,
    justifyContent: 'center',
  },
  wrapSmall: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    minHeight: 22,
    justifyContent: 'center',
  },
});
