import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { CategoryLetters, getCategoryColors, Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from './Text';

type Props = {
  category: string;
  showMark?: boolean;
  size?: 'sm' | 'md';
};

export function CategoryBadge({ category, showMark = true, size = 'md' }: Props) {
  const { colors } = useTheme();
  const categoryColors = useMemo(() => getCategoryColors(colors), [colors]);
  const color = categoryColors[category] ?? colors.textTertiary;
  const letter = CategoryLetters[category] ?? '?';

  return (
    <View
      style={[
        styles.badge,
        size === 'sm' && styles.badgeSm,
        { borderColor: colors.border, backgroundColor: colors.chipBackground },
      ]}
    >
      {showMark && (
        <View style={[styles.mark, size === 'sm' && styles.markSm, { borderColor: color }]}>
          <Text
            variant="label"
            color={color}
            style={[styles.markLetter, size === 'sm' && styles.markLetterSm]}
          >
            {letter}
          </Text>
        </View>
      )}
      <Text variant="label" color={colors.textSecondary} style={styles.catLabel}>
        {category.toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 5,
    borderRadius: Radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    alignSelf: 'flex-start',
  },
  badgeSm: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 4,
  },
  mark: {
    width: 18,
    height: 18,
    borderRadius: Radius.full,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  markSm: {
    width: 14,
    height: 14,
    borderWidth: 1,
  },
  markLetter: {
    fontSize: 10,
    letterSpacing: 0,
    fontWeight: '700',
  },
  markLetterSm: {
    fontSize: 8,
  },
  catLabel: {
    letterSpacing: 1,
    opacity: 0.95,
  },
});
