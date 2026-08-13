import React, { useCallback, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useQueryClient } from '@tanstack/react-query';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useServerCountdown } from '../../hooks/useServerCountdown';
import { formatMinutesSecondsCountdown } from '../../utils/time';
import { IconTimer } from '../icons/Icons';
import { Text } from '../ui/Text';
import { scheduleQueryInvalidation } from '../../lib/queryInvalidationBatcher';

type Props = { firesAt: string };

export function UpcomingDojiBanner({ firesAt }: Props) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const handleExpire = useCallback(() => {
    scheduleQueryInvalidation(queryClient, ['upcomingDoji', 'userEvent'], 0);
  }, [queryClient]);
  const seconds = useServerCountdown(firesAt, { onExpire: handleExpire });
  const styles = useMemo(
    () =>
      StyleSheet.create({
        wrapper: {
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          borderRadius: Radius.lg,
          overflow: 'hidden',
        },
        content: {
          minHeight: 76,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        },
        icon: {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.onGradientPillStrong,
        },
        body: { flex: 1, gap: 2 },
        timer: {
          color: colors.onPrimary,
          fontVariant: ['tabular-nums'],
          minWidth: 54,
          textAlign: 'right',
        },
        onPrimary: { color: colors.onPrimary },
        secondary: { color: colors.onPrimary, opacity: 0.84 },
      }),
    [colors],
  );

  return (
    <View
      style={styles.wrapper}
      accessibilityRole="text"
      accessibilityLabel={`Doji coming soon. Starts in ${formatMinutesSecondsCountdown(seconds)}.`}
    >
      <LinearGradient colors={[colors.primary, colors.accent]} style={styles.content}>
        <View style={styles.icon}>
          <IconTimer size={24} color={colors.onPrimary} />
        </View>
        <View style={styles.body}>
          <Text variant="label" style={styles.secondary}>DOJI COMING SOON</Text>
          <Text variant="headingMedium" style={styles.onPrimary}>Be ready when it drops</Text>
        </View>
        <Text variant="headingLarge" style={styles.timer}>
          {formatMinutesSecondsCountdown(seconds)}
        </Text>
      </LinearGradient>
    </View>
  );
}
