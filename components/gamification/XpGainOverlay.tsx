import React, { useEffect, useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '../../contexts/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { IconSpark } from '../icons/IconSpark';
import { XPBar } from './XPBar';
import { FullScreenCelebrationShell } from './FullScreenCelebrationShell';

type Props = {
  amount: number;
  sparks?: number;
  xp: number;
  level: number;
  subtitle?: string;
  dismissLabel?: string;
  onComplete: () => void;
};

export function XpGainOverlay({
  amount,
  sparks,
  xp,
  level,
  subtitle = 'Challenge complete!',
  dismissLabel = 'Continue',
  onComplete,
}: Props) {
  const { colors } = useTheme();
  const amountScale = useSharedValue(0.85);
  const amountOpacity = useSharedValue(0);
  const sparksScale = useSharedValue(0.94);
  const sparksOpacity = useSharedValue(0);

  useEffect(() => {
    amountOpacity.value = withTiming(1, { duration: 260 });
    amountScale.value = withDelay(100, withSpring(1, { damping: 12, stiffness: 130 }));
  }, [amount, amountOpacity, amountScale]);

  useEffect(() => {
    if (sparks == null || sparks <= 0) {
      sparksOpacity.value = 0;
      sparksScale.value = 0.94;
      return;
    }
    sparksOpacity.value = withDelay(240, withTiming(1, { duration: 220 }));
    sparksScale.value = withDelay(
      240,
      withSpring(1, { damping: 14, stiffness: 260 }),
    );
  }, [sparks, sparksOpacity, sparksScale]);

  const amountAnimStyle = useAnimatedStyle(() => ({
    opacity: amountOpacity.value,
    transform: [{ scale: amountScale.value }],
  }));

  const sparksAnimStyle = useAnimatedStyle(() => ({
    opacity: sparksOpacity.value,
    transform: [{ scale: sparksScale.value }],
  }));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        hero: {
          alignItems: 'center',
          gap: Spacing.sm,
          paddingVertical: Spacing.md,
          width: '100%',
        },
        amount: {
          fontSize: 48,
          lineHeight: 56,
          fontWeight: '900',
          letterSpacing: -1,
          color: colors.xpGold,
          textAlign: 'center',
          ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
        },
        sparksRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        },
        sparksText: {
          fontSize: 18,
          lineHeight: 24,
          fontWeight: '700',
          color: colors.accent,
          textAlign: 'center',
          ...(Platform.OS === 'android' ? { includeFontPadding: false } : null),
        },
        subtitle: {
          textAlign: 'center',
          marginTop: Spacing.xs,
        },
        progressCard: {
          width: '100%',
          maxWidth: 340,
          marginTop: Spacing.lg,
          padding: Spacing.md,
          borderRadius: Radius.lg,
          backgroundColor: colors.surfaceElevated,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
          gap: Spacing.md,
        },
        cta: {
          marginTop: Spacing.lg,
          minWidth: 200,
          alignSelf: 'center',
        },
      }),
    [colors],
  );

  return (
    <FullScreenCelebrationShell
      onRequestClose={onComplete}
      backgroundColor={colors.background}
      showParticles={false}
      contentStyle={{ gap: Spacing.lg, maxWidth: 360 }}
    >
      <Animated.View style={[styles.hero, amountAnimStyle]}>
        <Text style={styles.amount}>+{amount.toLocaleString()} XP</Text>
      </Animated.View>
      {sparks != null && sparks > 0 ? (
        <Animated.View style={[styles.sparksRow, sparksAnimStyle]}>
          <IconSpark size={18} />
          <Text style={styles.sparksText}>+{sparks.toLocaleString()} Sparks</Text>
        </Animated.View>
      ) : null}

      <Text variant="body" color={colors.textSecondary} style={styles.subtitle}>
        {subtitle}
      </Text>

      <View style={styles.progressCard}>
        <XPBar xp={xp} level={level} />
      </View>

      <Button onPress={onComplete} size="md" style={styles.cta}>
        {dismissLabel}
      </Button>
    </FullScreenCelebrationShell>
  );
}
