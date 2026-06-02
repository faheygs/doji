import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import Animated from 'react-native-reanimated';
import { Radius, Spacing, Shadows } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconSpark } from '@/components/icons/IconSpark';
import { IconChevronRight } from '@/components/icons/Icons';
import { useSparkGainPulse } from '@/hooks/useSparkGainPulse';

type Props = {
  amount: number;
  onPress: () => void;
};

/** Full-width sparks balance + shop entry on profile. */
export function ProfileShopEntry({ amount, onPress }: Props) {
  const { colors } = useTheme();
  const { containerStyle, iconStyle, highlightStyle, gainLabelStyle, gainLabel } =
    useSparkGainPulse(amount, true);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          position: 'relative',
        },
        card: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.lg,
          gap: Spacing.md,
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          ...Shadows.card,
        },
        highlight: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.accent,
        },
        left: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          flex: 1,
          minWidth: 0,
        },
        meta: {
          gap: 2,
          flex: 1,
          minWidth: 0,
        },
        shopRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 2,
          paddingLeft: Spacing.sm,
        },
        gainLabel: {
          position: 'absolute',
          top: 8,
          right: Spacing.lg,
          fontSize: 11,
          fontWeight: '800',
          color: colors.accent,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Open Shop, ${amount.toLocaleString()} Sparks`}
      >
        <Animated.View style={[styles.card, containerStyle]}>
          <Animated.View pointerEvents="none" style={[styles.highlight, highlightStyle]} />
          <View style={styles.left}>
            <Animated.View style={iconStyle}>
              <IconSpark size={20} />
            </Animated.View>
            <View style={styles.meta}>
              <Text variant="micro" color={colors.textSecondary}>
                Sparks
              </Text>
              <Text variant="headingMedium" style={{ fontWeight: '800' }}>
                {amount.toLocaleString()}
              </Text>
            </View>
          </View>
          <View style={styles.shopRow}>
            <Text variant="label" color={colors.textSecondary}>
              Shop
            </Text>
            <IconChevronRight size={14} color={colors.textTertiary} />
          </View>
        </Animated.View>
      </TouchableOpacity>
      {gainLabel != null ? (
        <Animated.Text style={[styles.gainLabel, gainLabelStyle]} pointerEvents="none">
          +{gainLabel}
        </Animated.Text>
      ) : null}
    </View>
  );
}
