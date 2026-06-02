import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Spacing, Radius } from '../../constants/theme';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { FullScreenCelebrationShell } from './FullScreenCelebrationShell';

type Props = {
  level: number;
  subtitle?: string;
  onDismiss: () => void;
};

export function LevelUpModal({
  level,
  subtitle = "You're leveling up!",
  onDismiss,
}: Props) {
  const { colors } = useTheme();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        levelNum: {
          fontSize: 112,
          fontWeight: '900',
          color: '#FFFFFF',
          letterSpacing: -0.05,
          lineHeight: 112,
        },
        pill: {
          backgroundColor: colors.level,
          borderRadius: Radius.full,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.sm,
        },
      }),
    [colors.level],
  );

  return (
    <FullScreenCelebrationShell onRequestClose={onDismiss}>
      <Text variant="label" color={colors.level} style={{ letterSpacing: 1.2 }}>
        LEVEL UP!
      </Text>
      <Text style={styles.levelNum}>{level}</Text>
      <View style={styles.pill}>
        <Text variant="subhead" color="#FFFFFF">
          Level {level} Unlocked
        </Text>
      </View>
      <Text variant="body" color="rgba(255,255,255,0.6)" style={{ textAlign: 'center' }}>
        {subtitle}
      </Text>
      <Button onPress={onDismiss} size="md" style={{ marginTop: Spacing.sm, minWidth: 200 }}>
        Keep going!
      </Button>
    </FullScreenCelebrationShell>
  );
}
