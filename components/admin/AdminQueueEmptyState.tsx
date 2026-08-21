import React from 'react';
import { StyleSheet, View } from 'react-native';
import { IconCheck } from '@/components/icons/Icons';
import { Text } from '@/components/ui/Text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';

type Props = {
  title: string;
  message: string;
};

export function AdminQueueEmptyState({ title, message }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.container} accessibilityRole="summary">
      <View
        style={[
          styles.icon,
          { backgroundColor: `${colors.success}16`, borderColor: `${colors.success}35` },
        ]}
      >
        <IconCheck size={28} color={colors.success} />
      </View>
      <Text variant="headingMedium" style={styles.centered}>{title}</Text>
      <Text variant="body" color={colors.textSecondary} style={styles.centered}>
        {message}
      </Text>
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
  icon: {
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.full,
    borderWidth: 1,
    marginBottom: Spacing.xs,
  },
  centered: { textAlign: 'center' },
});
