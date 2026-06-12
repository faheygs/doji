import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { KeyboardSafeSheet } from '@/components/ui/KeyboardSafeSheet';
import { SparksPill } from '@/components/economy/SparksPill';
import { SPARKS_BUY_IN_COST } from '@/constants/sparks';
import type { Challenge, UserEvent } from '@/types/database';
import { challengeKindLabel } from '@/lib/challengeDisplay';

type Props = {
  visible: boolean;
  userEvent: UserEvent | null;
  challenge: Challenge | null | undefined;
  sparksBalance: number;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
};

export function BuyInSheet({
  visible,
  userEvent,
  challenge,
  sparksBalance,
  onConfirm,
  onClose,
  loading,
}: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        title: { marginBottom: Spacing.xs },
        body: { marginBottom: Spacing.lg, lineHeight: 22 },
        preview: {
          backgroundColor: colors.surface,
          borderRadius: Radius.md,
          padding: Spacing.md,
          marginBottom: Spacing.md,
          gap: Spacing.sm,
        },
        row: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingVertical: Spacing.sm,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
        },
        actions: { gap: Spacing.sm },
      }),
    [colors],
  );

  const balanceAfter = sparksBalance - SPARKS_BUY_IN_COST;
  const challengeType = challenge?.type ?? 'poll';

  const footer = (
    <View style={styles.actions}>
      <Button onPress={onConfirm} loading={loading} disabled={sparksBalance < SPARKS_BUY_IN_COST}>
        Buy in for {SPARKS_BUY_IN_COST} Sparks
      </Button>
      <Button variant="ghost" onPress={onClose}>
        Cancel
      </Button>
    </View>
  );

  return (
    <KeyboardSafeSheet visible={visible} onClose={onClose} title="" footer={footer}>
      <Text variant="heading" style={styles.title}>
        Buy into today&apos;s Doji
      </Text>
      <Text variant="body" color={colors.textSecondary} style={styles.body}>
        You missed the window, but you can still participate — and keep your streak — for {SPARKS_BUY_IN_COST}{' '}
        Sparks.
      </Text>

      <View style={styles.preview}>
        <Text variant="micro" color={colors.primary}>
          {challengeKindLabel(challenge ?? null, challengeType).toUpperCase()}
        </Text>
        <Text variant="body" color={colors.text}>
          {challenge?.title ?? userEvent?.challenge?.title ?? 'Today\'s challenge'}
        </Text>
      </View>

      <View style={styles.row}>
        <Text variant="body" color={colors.textSecondary}>
          Buy-in cost
        </Text>
        <SparksPill amount={SPARKS_BUY_IN_COST} compact />
      </View>
      <View style={styles.row}>
        <Text variant="body" color={colors.textSecondary}>
          Balance after
        </Text>
        <SparksPill amount={Math.max(0, balanceAfter)} compact />
      </View>
    </KeyboardSafeSheet>
  );
}
