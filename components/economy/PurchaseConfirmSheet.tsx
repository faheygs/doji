import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { KeyboardSafeSheet } from '@/components/ui/KeyboardSafeSheet';
import { SparkPriceTag } from '@/components/economy/SparkPriceTag';
import { ShopItemPreview } from '@/components/economy/ShopItemPreview';
import { TITLE_CATALOG } from '@/lib/cosmetics';
import type { ShopItem, Profile } from '@/types/database';

type ProfilePreview = Pick<Profile, 'avatar_url' | 'username' | 'display_name'> | null;

type Props = {
  visible: boolean;
  item: ShopItem | null;
  profile?: ProfilePreview;
  sparksBalance: number;
  onConfirm: () => void;
  onClose: () => void;
  loading?: boolean;
};

export function PurchaseConfirmSheet({
  visible,
  item,
  profile,
  sparksBalance,
  onConfirm,
  onClose,
  loading,
}: Props) {
  const { colors } = useTheme();
  const price = item?.price ?? 0;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        preview: {
          alignItems: 'center',
          gap: Spacing.md,
          marginBottom: Spacing.lg,
        },
        previewBox: {
          width: '100%',
          alignItems: 'center',
          paddingVertical: Spacing.md,
        },
        costRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          marginBottom: Spacing.md,
        },
        actions: { gap: Spacing.sm },
      }),
    [colors],
  );

  if (!item) return null;

  const kindLabel =
    item.kind === 'theme' ? 'Accent theme' : item.kind === 'border' ? 'Avatar frame' : 'Profile title';

  const titleTagline =
    item.kind === 'title'
      ? TITLE_CATALOG[item.key]?.tagline ?? (item.metadata?.tagline as string | undefined)
      : undefined;

  return (
    <KeyboardSafeSheet visible={visible} onClose={onClose} title="">
      <View style={styles.preview}>
        <View style={styles.previewBox}>
          <ShopItemPreview item={item} profile={profile} size="large" />
        </View>
        <View style={{ alignItems: 'center', gap: 4 }}>
          <Text variant="heading">{item.name}</Text>
          {titleTagline ? (
            <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
              {titleTagline}
            </Text>
          ) : (
            <Text variant="body" color={colors.textTertiary}>
              {kindLabel}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.costRow}>
        <Text variant="body" color={colors.textSecondary}>
          Cost
        </Text>
        <SparkPriceTag price={price} />
      </View>

      <View style={styles.actions}>
        <Button onPress={onConfirm} loading={loading} disabled={sparksBalance < price}>
          Buy for {price.toLocaleString()} Sparks
        </Button>
        <Button variant="ghost" onPress={onClose}>
          Cancel
        </Button>
      </View>
    </KeyboardSafeSheet>
  );
}
