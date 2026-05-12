import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Typography, Spacing, Radius, Shadows } from '../../constants/theme';
import { BadgeIcon } from '../icons/BadgeIcons';
import { Text } from '../ui/Text';
import type { Badge, UserBadge } from '../../types/database';

type Props = {
  badges: Badge[];
  earned: UserBadge[];
};

export function BadgesGrid({ badges, earned }: Props) {
  const { colors } = useTheme();
  const earnedIds = new Set(earned.map((ub) => ub.badge_id));

  return (
    <View style={styles.grid}>
      {badges.map((badge) => {
        const isEarned = earnedIds.has(badge.id);
        return (
          <View
            key={badge.id}
            style={[
              styles.cell,
              {
                backgroundColor: isEarned ? colors.surface : colors.surfaceMuted,
                borderColor: isEarned ? colors.primary : colors.border,
                opacity: isEarned ? 1 : 0.45,
                ...Shadows.card,
              },
            ]}
          >
            <BadgeIcon
              badgeId={badge.id}
              size={26}
              color={isEarned ? colors.primary : colors.textTertiary}
            />
            <Text
              variant="micro"
              color={isEarned ? colors.text : colors.textTertiary}
              style={{ textAlign: 'center', marginTop: 6 }}
              numberOfLines={1}
            >
              {badge.name}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  cell: {
    width: '30%',
    aspectRatio: 1,
    borderRadius: Radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xs,
  },
});
