import React from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
};

export function ErrorState({
  title = 'Something went wrong',
  message = 'Please try again.',
  onRetry,
  compact = false,
}: Props) {
  const { colors } = useTheme();

  if (compact) {
    return (
      <View style={[styles.compactContainer, { backgroundColor: `${colors.error}12`, borderColor: `${colors.error}30` }]}>
        <View style={styles.compactContent}>
          <Text variant="bodySmall" color={colors.error}>
            {message}
          </Text>
          {onRetry && (
            <TouchableOpacity onPress={onRetry} hitSlop={8}>
              <Text variant="label" color={colors.error}>
                Retry
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text variant="headingLarge" color={colors.text} style={styles.centered}>
        {title}
      </Text>
      <Text variant="body" color={colors.textSecondary} style={styles.centered}>
        {message}
      </Text>
      {onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={[styles.retryButton, { backgroundColor: colors.primary }]}
          activeOpacity={0.85}
        >
          <Text variant="label" color="#FFFFFF">
            Try Again
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  centered: {
    textAlign: 'center',
  },
  retryButton: {
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm + 2,
    borderRadius: Radius.md,
  },
  compactContainer: {
    marginHorizontal: Spacing.md,
    marginVertical: Spacing.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.sm,
  },
  compactContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
});
