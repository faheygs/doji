import React, { useState, useMemo } from 'react';
import {
  View,
  StyleSheet,
  type LayoutChangeEvent,
  useWindowDimensions,
  TouchableOpacity,
  Modal,
  ScrollView,
  Pressable,
  Platform,
} from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { Spacing, Radius, Shadows } from '../../constants/theme';
import { BadgeIcon } from '../icons/BadgeIcons';
import { Text } from '../ui/Text';
import type { Badge, UserBadge } from '../../types/database';
import {
  computeBadgeProgress,
  type BadgeProgressStats,
} from '../../lib/badgeProgress';

const COLUMN_GAP = Spacing.md;
const ROW_GAP = Spacing.md;

function criteriaLabel(type: string, value: number): string {
  switch (type) {
    case 'streak_days':
      return `Reach a ${value}-day streak`;
    case 'completions':
      return `Complete ${value} challenge${value === 1 ? '' : 's'}`;
    case 'total_xp':
      return `Earn ${value.toLocaleString()} total XP`;
    case 'reactions_given':
      return `Give ${value} reaction${value === 1 ? '' : 's'}`;
    case 'reactions_received':
      return `Receive ${value} reaction${value === 1 ? '' : 's'}`;
    case 'poll_votes':
      return `Vote in ${value} poll${value === 1 ? '' : 's'}`;
    case 'friends_count':
      return `Have ${value} friend${value === 1 ? '' : 's'}`;
    case 'level_reached':
      return `Reach level ${value}`;
    case 'challenge_idea':
      return 'Submit an idea to the challenge pool';
    case 'challenge_idea_picked':
      return 'Have your idea selected for a daily challenge';
    default:
      return `Reach ${value}`;
  }
}

type Props = {
  badges: Badge[];
  earned: UserBadge[];
  /**
   * Live profile-derived stats for progress in the detail sheet only.
   */
  progressStats?: BadgeProgressStats | null;
};

export function BadgesGrid({ badges, earned, progressStats }: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const earnedMap = new Map(earned.map((ub) => [ub.badge_id, ub]));
  const [gridWidth, setGridWidth] = useState(0);
  const [selected, setSelected] = useState<Badge | null>(null);

  const onGridLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== gridWidth) setGridWidth(w);
  };

  const basisW = gridWidth > 0 ? gridWidth : Math.max(0, windowWidth - Spacing.md * 2);
  const cellSize = Math.max(0, Math.floor((basisW - 2 * COLUMN_GAP) / 3));

  const selectedEarned = selected ? earnedMap.get(selected.id) : undefined;
  const selectedIsEarned = !!selectedEarned;
  const selectedProgress =
    selected && progressStats && !selectedIsEarned
      ? computeBadgeProgress(selected, progressStats)
      : null;

  const modalStyles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: colors.overlayBackdrop,
          justifyContent: 'flex-end',
        },
        sheet: {
          borderTopLeftRadius: Radius.xl,
          borderTopRightRadius: Radius.xl,
          maxHeight: '75%',
          ...Platform.select({
            ios: {
              shadowColor: colors.shadowBase,
              shadowOffset: { width: 0, height: -2 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
            },
            android: { elevation: 16 },
          }),
        },
      }),
    [colors],
  );

  return (
    <>
      <View style={styles.gridMeasure} onLayout={onGridLayout}>
        <View style={[styles.grid, { rowGap: ROW_GAP, columnGap: COLUMN_GAP }]}>
          {badges.map((badge) => {
            const isEarned = earnedMap.has(badge.id);
            return (
              <TouchableOpacity
                key={badge.id}
                onPress={() => setSelected(badge)}
                activeOpacity={0.75}
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
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <Modal
        visible={!!selected}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setSelected(null)}
      >
        <Pressable style={modalStyles.backdrop} onPress={() => setSelected(null)}>
          <Pressable
            style={[modalStyles.sheet, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            {selected ? (
              <ScrollView
                contentContainerStyle={styles.sheetContent}
                showsVerticalScrollIndicator={false}
              >
                {/* Icon */}
                <View
                  style={[
                    styles.sheetIconCircle,
                    {
                      backgroundColor: selectedIsEarned ? colors.primaryPale : colors.surfaceMuted,
                      borderColor: selectedIsEarned ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <BadgeIcon
                    badgeId={selected.id}
                    size={44}
                    color={selectedIsEarned ? colors.primary : colors.textTertiary}
                  />
                </View>

                {/* Name */}
                <Text variant="headingLarge" style={styles.sheetTitle}>
                  {selected.name}
                </Text>

                {/* Earned / locked pill */}
                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: selectedIsEarned ? colors.success + '22' : colors.surfaceMuted,
                      borderColor: selectedIsEarned ? colors.success : colors.border,
                    },
                  ]}
                >
                  <Text
                    variant="micro"
                    color={selectedIsEarned ? colors.success : colors.textTertiary}
                  >
                    {selectedIsEarned
                      ? `EARNED ${new Date(selectedEarned!.earned_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                      : 'LOCKED'}
                  </Text>
                </View>

                {/* Description */}
                <Text
                  variant="body"
                  color={colors.textSecondary}
                  style={styles.sheetDescription}
                >
                  {selected.description}
                </Text>

                {/* Criteria */}
                <View style={[styles.criteriaBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Text variant="micro" color={colors.textTertiary} style={{ marginBottom: 4 }}>
                    HOW TO EARN
                  </Text>
                  <Text variant="body" color={colors.text}>
                    {criteriaLabel(selected.criteria_type, selected.criteria_value)}
                  </Text>
                </View>

                {!selectedIsEarned && selectedProgress ? (
                  <View style={[styles.progressSection, { borderColor: colors.border }]}>
                    <Text variant="micro" color={colors.textTertiary} style={{ marginBottom: 4 }}>
                      YOUR PROGRESS
                    </Text>
                    <Text variant="subhead" color={colors.text}>
                      {selectedProgress.label}
                    </Text>
                    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${selectedProgress.percent}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ) : null}

                {/* Dismiss */}
                <TouchableOpacity
                  onPress={() => setSelected(null)}
                  style={[styles.dismissBtn, { borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text variant="label" color={colors.textSecondary}>Close</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </>
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
  sheetContent: {
    alignItems: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
    paddingBottom: Spacing.xxl,
  },
  sheetIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  sheetTitle: {
    textAlign: 'center',
  },
  statusPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  sheetDescription: {
    textAlign: 'center',
    lineHeight: 22,
  },
  criteriaBox: {
    width: '100%',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
  },
  progressSection: {
    width: '100%',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.xs,
  },
  progressTrack: {
    width: '100%',
    height: 8,
    borderRadius: Radius.full,
    overflow: 'hidden',
    marginTop: Spacing.xs,
  },
  progressFill: {
    height: '100%',
    borderRadius: Radius.full,
  },
  dismissBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
