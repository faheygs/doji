import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, type ViewStyle, type StyleProp } from 'react-native';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconSpark } from '@/components/icons/IconSpark';

type Props = {
  amount: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function SparksPill({ amount, onPress, style, compact }: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        pill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: compact ? 4 : 6,
          backgroundColor: colors.surface,
          borderRadius: Radius.full,
          paddingVertical: compact ? 5 : 6,
          paddingHorizontal: compact ? 10 : 12,
          borderWidth: 1,
          borderColor: colors.border,
        },
        amount: {
          fontWeight: '700',
          fontSize: compact ? 13 : 14,
        },
      }),
    [colors, compact],
  );

  const inner = (
    <View style={[styles.pill, style]}>
      <IconSpark size={compact ? 12 : 14} />
      <Text variant="label" color={colors.text} style={styles.amount}>
        {amount.toLocaleString()}
      </Text>
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.75} accessibilityRole="button">
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
}
