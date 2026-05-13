import React, { useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent, useWindowDimensions } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Spacing, Radius, Shadows } from '../../constants/theme';
import { BadgeIcon } from '../icons/BadgeIcons';
import { Text } from '../ui/Text';
import type { Badge, UserBadge } from '../../types/database';

const COLUMN_GAP = Spacing.md;
const ROW_GAP = Spacing.md;

type Props = {
  badges: Badge[];
  earned: UserBadge[];
};

export function BadgesGrid({ badges, earned }: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const earnedIds = new Set(earned.map((ub) => ub.badge_id));
  const [gridWidth, setGridWidth] = useState(0);

  const onGridLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== gridWidth) setGridWidth(w);
  };

  const basisW = gridWidth > 0 ? gridWidth : Math.max(0, windowWidth - Spacing.md * 2);
  const cellSize = Math.max(0, Math.floor((basisW - 2 * COLUMN_GAP) / 3));

  return (
    <View style={styles.gridMeasure} onLayout={onGridLayout}>
      <View style={[styles.grid, { rowGap: ROW_GAP, columnGap: COLUMN_GAP }]}>
        {badges.map((badge) => {
          const isEarned = earnedIds.has(badge.id);
          return (
            <View
              key={badge.id}
              style={[
                styles.cell,
                { width: cellSize, height: cellSize },
                {
                  backgroundColor: isEarned ? colors.surface : colors.surfaceMuted,
                  borderColor: isEarned ? colors.primary : colors.border,
                  opacity: isEarned ? 1 : 0.45,
                  ...Shadows.card,
                },
              ]}
            >
              <View style={styles.iconWell}>
                <BadgeIcon
                  badgeId={badge.id}
                  size={28}
                  color={isEarned ? colors.primary : colors.textTertiary}
                />
              </View>
              <Text
                variant="micro"
                color={isEarned ? colors.text : colors.textTertiary}
                style={styles.badgeName}
                numberOfLines={2}
              >
                {badge.name}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  gridMeasure: {
    width: '100%',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
  },
  cell: {
    borderRadius: Radius.md,
    borderWidth: 1,
    paddingHorizontal: Spacing.xs,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    overflow: 'hidden',
  },
  iconWell: {
    flex: 1,
    width: '100%',
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeName: {
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
