import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  type LayoutChangeEvent,
  useWindowDimensions,
  TouchableOpacity,
  Modal,
  Pressable,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../contexts/ThemeContext';
import { Spacing, Radius, Shadows, BADGE_TIER_COLORS, type BadgeTierName } from '../../constants/theme';
import { Text } from '../ui/Text';
import { IconClose, IconCheck } from '../icons/Icons';
import type { BadgeCategory, BadgeTier, UserBadgeProgress } from '../../types/database';
import { CategoryBadgeIcon } from '../icons/BadgeIcons';
import {
  computeBadgeProgress,
  displayTierForCategory,
  isTierCriteriaMet,
  type BadgeProgressStats,
} from '../../lib/badgeProgress';
import { useDismissOnRouteBlur } from '../../hooks/useDismissOnRouteBlur';

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
  const { width: windowWidth, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
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
  const nextTier = selectedTiers.find((t) => {
    const dbMet = selectedTier != null && tierRank(selectedTier) >= tierRank(t.tier);
    return !dbMet && !(progressStats && isTierCriteriaMet(t, progressStats));
  });
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

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    setSelected(null);
  }, []);
  useDismissOnRouteBlur(Boolean(selected), handleClose);

  const sheetStyles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'flex-end',
        },
        scrim: {
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0,0,0,0.25)',
        },
        sheet: {
          height: winH * 0.5,
          backgroundColor: colors.surfaceElevated,
          borderTopLeftRadius: Radius.xl,
          borderTopRightRadius: Radius.xl,
          borderWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: 0,
          borderColor: colors.border,
          paddingTop: Spacing.sm,
        },
        grab: {
          alignSelf: 'center',
          width: 42,
          height: 5,
          borderRadius: 3,
          backgroundColor: colors.textTertiary,
          opacity: 0.4,
          marginBottom: Spacing.sm,
        },
        headRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.sm,
          gap: Spacing.sm,
        },
        scroll: {
          flex: 1,
          paddingHorizontal: Spacing.lg,
        },
        scrollContent: {
          gap: Spacing.md,
          paddingBottom: Math.max(insets.bottom, Spacing.md),
          alignItems: 'center',
        },
      }),
    [colors, winH, insets.bottom],
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

      {!readOnly && selected ? (
        <Modal
          visible
          transparent
          animationType="fade"
          onRequestClose={handleClose}
        >
          <View style={sheetStyles.backdrop}>
            <Pressable
              style={sheetStyles.scrim}
              onPress={handleClose}
              accessibilityLabel="Dismiss"
            />
            <View style={sheetStyles.sheet}>
              <View style={sheetStyles.grab} />
              <View style={sheetStyles.headRow}>
                <Text variant="headingMedium" style={{ flex: 1 }}>
                  {selected?.name ?? ''}
                </Text>
                <Pressable onPress={handleClose} hitSlop={14} accessibilityLabel="Close">
                  <IconClose size={26} color={colors.textSecondary} />
                </Pressable>
              </View>
              <ScrollView
                style={sheetStyles.scroll}
                contentContainerStyle={sheetStyles.scrollContent}
                showsVerticalScrollIndicator={false}
              >
                {selected ? (
                  <>
                    <View
                      style={[
                        styles.sheetIconCircle,
                        {
                          backgroundColor: selectedDisplayTier ? `${borderColor}20` : colors.surfaceMuted,
                          borderColor,
                        },
                      ]}
                    >
                      <CategoryBadgeIcon categoryId={selected.id} size={44} color={borderColor} />
                    </View>

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

                    <View style={[styles.criteriaBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                      <Text variant="micro" color={colors.textTertiary} style={{ marginBottom: Spacing.sm }}>
                        TIERS
                      </Text>
                      {selectedTiers.map((tierDef) => {
                        const dbMet = selectedTier != null && tierRank(selectedTier) >= tierRank(tierDef.tier);
                        const met = dbMet || (progressStats != null && isTierCriteriaMet(tierDef, progressStats));
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
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
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
  sheetIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.xs,
  },
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
});
