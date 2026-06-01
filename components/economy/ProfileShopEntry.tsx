import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Radius, Spacing, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconSpark } from '@/components/icons/IconSpark';
import { IconChevronRight } from '@/components/icons/Icons';

type Props = {
  amount: number;
  onPress: () => void;
};

/** Compact sparks + shop tile for the profile streak row. */
export function ProfileShopEntry({ amount, onPress }: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          flex: 1,
          alignItems: 'center',
          paddingVertical: 14,
          paddingHorizontal: Spacing.sm,
          gap: 4,
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          ...Shadows.card,
        },
        valueRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        },
        label: {
          textAlign: 'center',
        },
      }),
    [colors],
  );

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.75}
      accessibilityRole="button"
      accessibilityLabel={`Open Shop, ${amount.toLocaleString()} Sparks`}
      style={styles.card}
    >
      <Text variant="micro" color={colors.textSecondary} style={styles.label}>
        Sparks
      </Text>
      <View style={styles.valueRow}>
        <IconSpark size={16} />
        <Text variant="headingMedium" style={{ fontWeight: '800' }}>
          {amount.toLocaleString()}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
        <Text variant="micro" color={colors.textTertiary}>
          Shop
        </Text>
        <IconChevronRight size={10} color={colors.textTertiary} />
      </View>
    </TouchableOpacity>
  );
}
