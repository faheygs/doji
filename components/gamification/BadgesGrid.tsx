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
import { Spacing, Radius, Shadows, BADGE_TIER_COLORS, type BadgeTierName } from '../../constants/theme';
import { Text } from '../ui/Text';
import type { BadgeCategory, BadgeTier, UserBadgeProgress } from '../../types/database';
import { CategoryBadgeIcon } from '../icons/BadgeIcons';
import { IconCheck } from '../icons/Icons';
import {
  computeBadgeProgress,
  displayTierForCategory,
  isTierCriteriaMet,
  type BadgeProgressStats,
} from '../../lib/badgeProgress';

const COLUMN_GAP = Spacing.md;
const ROW_GAP = Spacing.md;
const TIER_ORDER: BadgeTierName[] = ['bronze', 'silver', 'gold', 'diamond'];

function tierRank(t: BadgeTierName): number {
  return TIER_ORDER.indexOf(t);
}

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
    case 'followers_count':
      return `Get ${value} follower${value === 1 ? '' : 's'}`;
    case 'friends_count':
      return `Have ${value} friend${value === 1 ? '' : 's'}`;
    case 'level_reached':
      return `Reach level ${value}`;
    case 'ideas_submitted':
      return `Submit ${value} challenge idea${value === 1 ? '' : 's'}`;
    case 'ideas_picked':
      return `Have ${value} idea${value === 1 ? '' : 's'} picked for a daily challenge`;
    default:
      return `Reach ${value}`;
  }
}

type Props = {
  categories: BadgeCategory[];
  tiers: BadgeTier[];
  progress: UserBadgeProgress[];
  progressStats?: BadgeProgressStats | null;
  readOnly?: boolean;
};

export function BadgesGrid({ categories, tiers, progress, progressStats, readOnly = false }: Props) {
  const { colors } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const progressMap = new Map(progress.map((p) => [p.category_id, p]));
  const tiersByCategory = useMemo(() => {
    const map = new Map<string, BadgeTier[]>();
    for (const tier of tiers) {
      const list = map.get(tier.category_id) ?? [];
      list.push(tier);
      map.set(tier.category_id, list);
    }
    for (const [, list] of map) {
      list.sort((a, b) => tierRank(a.tier) - tierRank(b.tier));
    }
    return map;
  }, [tiers]);

  const [gridWidth, setGridWidth] = useState(0);
  const [selected, setSelected] = useState<BadgeCategory | null>(null);

  const onGridLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w !== gridWidth) setGridWidth(w);
  };

  const basisW = gridWidth > 0 ? gridWidth : Math.max(0, windowWidth - Spacing.md * 2);
  const cellSize = Math.max(0, Math.floor((basisW - 2 * COLUMN_GAP) / 3));

  const selectedProgress = selected ? progressMap.get(selected.id) : undefined;
  const selectedTiers = selected ? (tiersByCategory.get(selected.id) ?? []) : [];
  const selectedTier = selectedProgress?.current_tier;
  const selectedDisplayTier = selected
    ? displayTierForCategory(selectedTier, selectedTiers, progressStats)
    : null;
  const nextTier = selectedTiers.find(
    (t) => progressStats && !isTierCriteriaMet(t, progressStats),
  );
  const borderColor = selectedDisplayTier
    ? BADGE_TIER_COLORS[selectedDisplayTier]
    : colors.border;
  const selectedProgressDetail =
    selected && nextTier && progressStats
      ? computeBadgeProgress(
          { criteria_type: nextTier.criteria_type, criteria_value: nextTier.criteria_value },
          progressStats,
        )
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
          {categories.map((category) => {
            const earned = progressMap.get(category.id);
            const categoryTiers = tiersByCategory.get(category.id) ?? [];
            const displayTier = displayTierForCategory(
              earned?.current_tier,
              categoryTiers,
              progressStats,
            );
            const tierColor = displayTier ? BADGE_TIER_COLORS[displayTier] : colors.border;
            const hasProgress = displayTier !== null;
            const cellStyle = [
              styles.cell,
              { width: cellSize, height: cellSize },
              {
                backgroundColor: hasProgress ? colors.surface : colors.surfaceMuted,
                borderColor: tierColor,
                borderWidth: hasProgress ? 2 : 1,
                opacity: hasProgress ? 1 : 0.65,
                ...Shadows.card,
              },
            ];
            const cellContent = (
              <>
                <CategoryBadgeIcon
                  categoryId={category.id}
                  size={28}
                  color={hasProgress ? tierColor : colors.textTertiary}
                />
                {displayTier ? (
                  <Text variant="nano" color={tierColor} style={styles.tierLabel}>
                    {displayTier.toUpperCase()}
                  </Text>
                ) : null}
                <Text
                  variant="micro"
                  color={hasProgress ? colors.text : colors.textTertiary}
                  style={styles.badgeName}
                  numberOfLines={2}
                >
                  {category.name}
                </Text>
              </>
            );

            if (readOnly) {
              return (
                <View key={category.id} style={cellStyle}>
                  {cellContent}
                </View>
              );
            }

            return (
              <TouchableOpacity
                key={category.id}
                onPress={() => setSelected(category)}
                activeOpacity={0.75}
                style={cellStyle}
              >
                {cellContent}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {!readOnly ? (
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
                <View
                  style={[
                    styles.sheetIconCircle,
                    {
                      backgroundColor: selectedDisplayTier
                        ? `${borderColor}20`
                        : colors.surfaceMuted,
                      borderColor: borderColor,
                    },
                  ]}
                >
                  <CategoryBadgeIcon categoryId={selected.id} size={44} color={borderColor} />
                </View>

                <Text variant="headingLarge" style={styles.sheetTitle}>
                  {selected.name}
                </Text>

                <View
                  style={[
                    styles.statusPill,
                    {
                      backgroundColor: selectedDisplayTier
                        ? colors.success + '22'
                        : colors.surfaceMuted,
                      borderColor: selectedDisplayTier ? colors.success : colors.border,
                    },
                  ]}
                >
                  <Text
                    variant="micro"
                    color={selectedDisplayTier ? colors.success : colors.textTertiary}
                  >
                    {selectedDisplayTier
                      ? selectedTier && selectedProgress
                        ? `${selectedDisplayTier.toUpperCase()} · ${new Date(selectedProgress.unlocked_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`
                        : `${selectedDisplayTier.toUpperCase()} · CRITERIA MET`
                      : 'LOCKED'}
                  </Text>
                </View>

                <Text variant="body" color={colors.textSecondary} style={styles.sheetDescription}>
                  {selected.description}
                </Text>

                <View style={[styles.criteriaBox, { backgroundColor: colors.surfaceElevated, borderColor: colors.border }]}>
                  <Text variant="micro" color={colors.textTertiary} style={{ marginBottom: Spacing.sm }}>
                    TIERS
                  </Text>
                  {selectedTiers.map((tierDef) => {
                    const met =
                      progressStats != null && isTierCriteriaMet(tierDef, progressStats);
                    const c = BADGE_TIER_COLORS[tierDef.tier];
                    return (
                      <View key={tierDef.id} style={styles.tierRow}>
                        <View
                          style={[
                            styles.tierBadge,
                            {
                              borderColor: met ? c : colors.border,
                              backgroundColor: met ? `${c}20` : colors.surfaceMuted,
                            },
                          ]}
                        >
                          {met ? <IconCheck size={18} color={c} /> : null}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text variant="subhead" color={met ? c : colors.textSecondary}>
                            {tierDef.tier.charAt(0).toUpperCase() + tierDef.tier.slice(1)}
                          </Text>
                          <Text variant="micro" color={colors.textTertiary}>
                            {criteriaLabel(tierDef.criteria_type, tierDef.criteria_value)}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>

                {!selectedDisplayTier && selectedProgressDetail ? (
                  <View style={[styles.progressSection, { borderColor: colors.border }]}>
                    <Text variant="micro" color={colors.textTertiary} style={{ marginBottom: 4 }}>
                      YOUR PROGRESS
                    </Text>
                    <Text variant="subhead" color={colors.text}>
                      {selectedProgressDetail.label}
                    </Text>
                    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${selectedProgressDetail.percent}%`,
                            backgroundColor: colors.primary,
                          },
                        ]}
                      />
                    </View>
                  </View>
                ) : null}

                {selectedDisplayTier && nextTier && selectedProgressDetail ? (
                  <View style={[styles.progressSection, { borderColor: colors.border }]}>
                    <Text variant="micro" color={colors.textTertiary} style={{ marginBottom: 4 }}>
                      NEXT: {nextTier.tier.toUpperCase()}
                    </Text>
                    <Text variant="subhead" color={colors.text}>
                      {selectedProgressDetail.label}
                    </Text>
                    <View style={[styles.progressTrack, { backgroundColor: colors.surfaceMuted }]}>
                      <View
                        style={[
                          styles.progressFill,
                          {
                            width: `${selectedProgressDetail.percent}%`,
                            backgroundColor: BADGE_TIER_COLORS[nextTier.tier],
                          },
                        ]}
                      />
                    </View>
                  </View>
                ) : null}

                <TouchableOpacity
                  onPress={() => setSelected(null)}
                  style={[styles.dismissBtn, { borderColor: colors.border }]}
                  activeOpacity={0.7}
                >
                  <Text variant="label" color={colors.textSecondary}>
                    Close
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  gridMeasure: { width: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  cell: {
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.xs,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  tierLabel: { letterSpacing: 0.6 },
  badgeName: { textAlign: 'center', marginTop: 2 },
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
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
  sheetTitle: { textAlign: 'center' },
  statusPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
  sheetDescription: { textAlign: 'center', lineHeight: 22 },
  criteriaBox: {
    width: '100%',
    borderRadius: Radius.md,
    borderWidth: 1,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  tierRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  tierBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tierInner: { width: 12, height: 12, borderRadius: 6 },
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
  progressFill: { height: '100%', borderRadius: Radius.full },
  dismissBtn: {
    marginTop: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.xl,
    borderRadius: Radius.full,
    borderWidth: 1,
  },
});
