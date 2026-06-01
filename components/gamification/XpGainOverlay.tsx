import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { Spacing } from '../../constants/theme';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { XPBar } from './XPBar';
import { FullScreenCelebrationShell } from './FullScreenCelebrationShell';

type Props = {
  visible: boolean;
  amount: number;
  xp: number;
  level: number;
  subtitle?: string;
  dismissLabel?: string;
  onComplete: () => void;
};

export function XpGainOverlay({
  visible,
  amount,
  xp,
  level,
  subtitle = 'Challenge complete!',
  dismissLabel = 'Continue',
  onComplete,
}: Props) {
  const { colors } = useTheme();
  const amountScale = useSharedValue(0.85);
  const amountOpacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      amountScale.value = 0.85;
      amountOpacity.value = 0;
      return;
    }
    amountOpacity.value = withTiming(1, { duration: 260 });
    amountScale.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 130 }));
  }, [visible, amount, amountOpacity, amountScale]);

  const amountAnimStyle = useAnimatedStyle(() => ({
    opacity: amountOpacity.value,
    transform: [{ scale: amountScale.value }],
  }));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        amount: {
          fontSize: 52,
          fontWeight: '900',
          letterSpacing: -0.02,
          color: colors.xpGold,
          textAlign: 'center',
        },
        xpBarWrap: {
          width: '100%',
          marginTop: Spacing.sm,
        },
      }),
    [colors.xpGold],
  );

  return (
    <FullScreenCelebrationShell
      visible={visible}
      onRequestClose={onComplete}
      backgroundColor={colors.background}
      showParticles={false}
    >
      <Animated.View style={amountAnimStyle}>
        <Text style={styles.amount}>+{amount.toLocaleString()} XP</Text>
      </Animated.View>
      <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
        {subtitle}
      </Text>
      <View style={styles.xpBarWrap}>
        <XPBar xp={xp} level={level} />
      </View>
      <Button onPress={onComplete} size="md" style={{ marginTop: Spacing.lg, minWidth: 200 }}>
        {dismissLabel}
      </Button>
    </FullScreenCelebrationShell>
  );
}
