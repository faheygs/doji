import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { SPARKS_BUY_IN_COST } from '../../constants/sparks';
import { useTheme } from '../../contexts/ThemeContext';
import { LiveSparksPill } from '../economy/SparksPill';
import { Text } from '../ui/Text';

type Props = {
  showBuyIn: boolean;
  canPay: boolean;
  onPress: () => void;
};

export function MissedChallengeBanner({ showBuyIn, canPay, onPress }: Props) {
  const { colors } = useTheme();
  const canOpen = showBuyIn && canPay;
  const styles = useMemo(() => StyleSheet.create({
    banner: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: Radius.lg,
      marginHorizontal: Spacing.md,
      marginBottom: Spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      padding: Spacing.md,
      gap: Spacing.sm,
    },
    body: { flex: 1 },
    buyIn: {
      backgroundColor: colors.primary,
      borderRadius: Radius.sm,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.md,
    },
    balance: { alignItems: 'flex-end', gap: 4 },
  }), [colors]);

  return (
    <TouchableOpacity
      style={styles.banner}
      onPress={onPress}
      activeOpacity={0.9}
      disabled={!canOpen}
      accessibilityRole={canOpen ? 'button' : undefined}
      accessibilityState={{ disabled: !canOpen }}
      accessibilityLabel={canOpen
        ? `Missed today's Doji. Buy in for ${SPARKS_BUY_IN_COST} Sparks`
        : `Missed today's Doji`}
    >
      <Text variant="body" color={colors.textSecondary} style={styles.body}>
        Missed today&apos;s Doji
      </Text>
      {showBuyIn ? canPay ? (
        <View style={styles.buyIn} pointerEvents="none">
          <Text variant="label" color={colors.onPrimary}>
            Buy in · {SPARKS_BUY_IN_COST} Sparks
          </Text>
        </View>
      ) : (
        <View style={styles.balance}>
          <Text variant="micro" color={colors.textTertiary}>
            Need {SPARKS_BUY_IN_COST} Sparks
          </Text>
          <LiveSparksPill compact />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}
