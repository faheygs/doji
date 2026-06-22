import React from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';

type Props = {
  emoji: string;
  label: string;
  desc: string;
  isLoading: boolean;
  onPress: () => void;
};

export function DemoChallengeCard({ emoji, label, desc, isLoading, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      disabled={isLoading}
      style={[styles.card, { backgroundColor: colors.surface }]}
    >
      <Text style={styles.emoji}>{emoji}</Text>
      <View style={styles.textBlock}>
        <Text variant="label" color={colors.text}>
          {label}
        </Text>
        <Text variant="bodySmall" color={colors.textSecondary}>
          {desc}
        </Text>
      </View>
      {isLoading ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Text variant="label" color={colors.primary}>
          Try it →
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    marginHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  emoji: {
    fontSize: 28,
  },
  textBlock: {
    flex: 1,
    gap: 2,
  },
});
