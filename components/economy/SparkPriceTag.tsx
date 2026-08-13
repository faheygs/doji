import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconSpark } from '@/components/icons/IconSpark';

type Props = {
  price: number;
};

export function SparkPriceTag({ price }: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        tag: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: Spacing.sm,
          paddingVertical: 4,
          borderRadius: Radius.full,
          backgroundColor: colors.surfaceElevated,
          borderWidth: 1,
          borderColor: colors.border,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.tag}>
      <IconSpark size={14} />
      <Text variant="micro" style={{ fontWeight: '700' }}>
        {price.toLocaleString()}
      </Text>
    </View>
  );
}
