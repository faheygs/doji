import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { useServerCountdown } from '../../hooks/useServerCountdown';
import { formatMinutesSecondsCountdown } from '../../utils/time';
import { Text } from '../ui/Text';
import { CountdownRing } from './CountdownRing';

type Props = {
  expiresAt: string | null | undefined;
  onExpire?: () => void;
  variant?: 'compact' | 'ring';
};

export function ChallengeTimer({ expiresAt, onExpire, variant = 'compact' }: Props) {
  const { colors } = useTheme();
  const remaining = useServerCountdown(expiresAt, { enabled: Boolean(expiresAt), onExpire });
  const urgent = remaining <= 60;
  const label = `${formatMinutesSecondsCountdown(remaining)} remaining`;

  if (!expiresAt) return null;
  if (variant === 'ring') {
    return <CountdownRing totalSeconds={600} remainingSeconds={remaining} />;
  }

  return (
    <View
      style={[styles.pill, { backgroundColor: colors.chipBackground }]}
      accessible
      accessibilityRole="timer"
      accessibilityLabel={label}
      accessibilityLiveRegion={urgent ? 'polite' : 'none'}
    >
      <Text variant="label" color={urgent ? colors.error : colors.textSecondary} style={styles.time}>
        {formatMinutesSecondsCountdown(remaining)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    minWidth: 64,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignItems: 'center',
  },
  time: { fontVariant: ['tabular-nums'] },
});
