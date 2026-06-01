import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';
import { CategoryBadgeIcon } from '../icons/BadgeIcons';
import { BADGE_TIER_COLORS, Spacing, type BadgeTierName } from '../../constants/theme';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { FullScreenCelebrationShell } from './FullScreenCelebrationShell';

const TIER_ORDER: BadgeTierName[] = ['bronze', 'silver', 'gold', 'diamond'];

type Props = {
  visible: boolean;
  categoryId: string;
  name: string;
  tier: BadgeTierName;
  /** Tiers unlocked in this category (for progress dots). */
  unlockedTiers?: BadgeTierName[];
  onDismiss: () => void;
};

export function BadgeUnlockModal({
  visible,
  categoryId,
  name,
  tier,
  unlockedTiers = [],
  onDismiss,
}: Props) {
  const { colors } = useTheme();
  const tierColor = BADGE_TIER_COLORS[tier];

  const styles = useMemo(
    () =>
      StyleSheet.create({
        iconWrap: {
          width: 120,
          height: 120,
          borderRadius: 32,
          borderWidth: 4,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: Spacing.xs,
        },
        tierRow: {
          flexDirection: 'row',
          gap: Spacing.sm,
          marginTop: Spacing.sm,
        },
        tierDot: {
          width: 32,
          height: 32,
          borderRadius: 10,
          borderWidth: 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tierInner: {
          width: 12,
          height: 12,
          borderRadius: 6,
        },
      }),
    [],
  );

  return (
    <FullScreenCelebrationShell visible={visible} onRequestClose={onDismiss}>
      <Text variant="label" color={colors.xpGold} style={{ letterSpacing: 1.2 }}>
        BADGE UNLOCKED
      </Text>
      <View
        style={[
          styles.iconWrap,
          {
            borderColor: tierColor,
            backgroundColor: `${tierColor}20`,
          },
        ]}
      >
        <CategoryBadgeIcon categoryId={categoryId} size={56} color={tierColor} />
      </View>
      <Text variant="displayMedium" color="#FFFFFF" style={{ textAlign: 'center' }}>
        {name}
      </Text>
      <Text variant="subhead" color={tierColor} style={{ textTransform: 'capitalize' }}>
        {tier} Tier
      </Text>
      <View style={styles.tierRow}>
        {TIER_ORDER.map((t) => {
          const earned = unlockedTiers.includes(t);
          const c = BADGE_TIER_COLORS[t];
          return (
            <View
              key={t}
              style={[
                styles.tierDot,
                {
                  borderColor: earned ? c : 'rgba(255,255,255,0.12)',
                  backgroundColor: earned ? `${c}25` : 'rgba(255,255,255,0.05)',
                },
              ]}
            >
              {earned ? <View style={[styles.tierInner, { backgroundColor: c }]} /> : null}
            </View>
          );
        })}
      </View>
      <Button onPress={onDismiss} size="md" style={{ marginTop: Spacing.lg, minWidth: 200 }}>
        Awesome!
      </Button>
    </FullScreenCelebrationShell>
  );
}
