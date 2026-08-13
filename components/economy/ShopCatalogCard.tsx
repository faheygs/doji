import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { Profile, ShopItem } from '../../types/database';
import { SparkPriceTag } from './SparkPriceTag';
import { ShopItemPreview } from './ShopItemPreview';
import { Text } from '../ui/Text';

type Props = {
  item: ShopItem;
  profile: Pick<Profile, 'avatar_url' | 'username' | 'display_name'> | null | undefined;
  owned: boolean;
  equipped: boolean;
  onPress: () => void;
};

export function ShopCatalogCard({ item, profile, owned, equipped, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.78}
      style={[
        styles.card,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: equipped ? colors.primary : colors.border,
          opacity: owned || equipped ? 1 : 0.9,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${equipped ? 'equipped' : owned ? 'owned' : `${item.price} Sparks`}`}
    >
      <View style={styles.header}>
        <Text variant="label" numberOfLines={1} style={styles.name}>{item.name}</Text>
        <SparkPriceTag price={item.price} />
      </View>
      <View style={styles.preview}>
        <ShopItemPreview item={item} profile={profile} size="compact" />
      </View>
      {equipped ? (
        <Text variant="micro" color={colors.primary}>Equipped</Text>
      ) : owned ? (
        <Text variant="micro" color={colors.success}>Tap to equip</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: { width: '47.5%', minHeight: 154, borderRadius: Radius.lg, borderWidth: 1, padding: Spacing.md, gap: Spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  name: { flex: 1 },
  preview: { minHeight: 72, alignItems: 'center', justifyContent: 'center' },
});
