import React, { useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, type ViewStyle, type StyleProp } from 'react-native';
import Animated from 'react-native-reanimated';
import { Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconSpark } from '@/components/icons/IconSpark';
import { useSparkGainPulse } from '@/hooks/useSparkGainPulse';
import { useSparksBalance } from '@/hooks/useSparks';

type Props = {
  amount: number;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
  /** Pulse when this live balance increases (skip for static price tags). */
  trackGain?: boolean;
};

export function SparksPill({ amount, onPress, style, compact, trackGain = false }: Props) {
  const { colors } = useTheme();
  const { containerStyle, iconStyle, highlightStyle, gainLabelStyle, gainLabel } =
    useSparkGainPulse(amount, trackGain);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          position: 'relative',
        },
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
          overflow: 'hidden',
        },
        highlight: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.accent,
        },
        amount: {
          fontWeight: '700',
          fontSize: compact ? 13 : 14,
        },
        gainLabel: {
          position: 'absolute',
          top: -14,
          right: 4,
          fontSize: 11,
          fontWeight: '800',
          color: colors.accent,
        },
      }),
    [colors, compact],
  );

  const inner = (
    <View style={styles.wrap}>
      <Animated.View style={[styles.pill, style, containerStyle]}>
        <Animated.View pointerEvents="none" style={[styles.highlight, highlightStyle]} />
        <Animated.View style={iconStyle}>
          <IconSpark size={compact ? 12 : 14} />
        </Animated.View>
        <Text variant="label" color={colors.text} style={styles.amount}>
          {amount.toLocaleString()}
        </Text>
      </Animated.View>
      {gainLabel != null ? (
        <Animated.Text style={[styles.gainLabel, gainLabelStyle]}>+{gainLabel}</Animated.Text>
      ) : null}
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

type LiveProps = Omit<Props, 'amount'>;

/** Sparks pill bound to the signed-in user's balance with gain animation. */
export function LiveSparksPill(props: LiveProps) {
  const amount = useSparksBalance();
  return <SparksPill amount={amount} trackGain {...props} />;
}
