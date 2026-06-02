import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import {
  Spacing,
  Radius,
  webScrollParentStyle,
  ACCENT_THEME_CATALOG,
  DEFAULT_ACCENT_THEME,
  type AccentThemeKey,
} from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { IconChevronLeft, IconCheck } from '@/components/icons/Icons';
import { LiveSparksPill } from '@/components/economy/SparksPill';
import { SparkPriceTag } from '@/components/economy/SparkPriceTag';
import { PurchaseConfirmSheet } from '@/components/economy/PurchaseConfirmSheet';
import { useSparksBalance } from '@/hooks/useSparks';
import {
  useShopCatalog,
  useOwnedShopItems,
  usePurchaseShopItem,
  useEquipShopItem,
  isShopItemOwned,
} from '@/hooks/useShop';
import { useAuthStore } from '@/stores/useAuthStore';
import { BORDER_CATALOG, TITLE_CATALOG } from '@/lib/cosmetics';
import { goBackWithOptionalReturn } from '@/lib/navigationReturn';
import type { ShopItem } from '@/types/database';

export default function ShopScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors, accentTheme: activeAccent } = useTheme();
  const sparks = useSparksBalance();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const profile = useAuthStore((s) => s.profile);
  const { data: catalog = [], isLoading } = useShopCatalog();
  const { data: owned = [] } = useOwnedShopItems(userId);
  const purchase = usePurchaseShopItem();
  const equip = useEquipShopItem();
  const [confirmItem, setConfirmItem] = useState<ShopItem | null>(null);

  const themes = catalog.filter((i) => i.kind === 'theme' && i.key !== DEFAULT_ACCENT_THEME);
  const borders = catalog.filter((i) => i.kind === 'border');
  const titles = catalog.filter((i) => i.kind === 'title');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        section: { paddingHorizontal: Spacing.lg, marginTop: Spacing.lg, gap: Spacing.md },
        themeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.md },
        themeSwatch: {
          width: 60,
          height: 60,
          borderRadius: Radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        borderRow: { flexDirection: 'row', gap: Spacing.md },
        borderItem: { flex: 1, alignItems: 'center', gap: Spacing.sm },
        titleList: { gap: Spacing.sm },
        titleRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          padding: Spacing.md,
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
        },
        titleRowEquipped: {
          borderColor: colors.primary,
        },
        titleBadge: {
          alignSelf: 'flex-start',
          paddingHorizontal: Spacing.sm,
          paddingVertical: 4,
          borderRadius: Radius.full,
          borderWidth: 1,
          borderColor: colors.primary,
          backgroundColor: colors.surfaceElevated,
        },
        equippedLabel: { fontWeight: '600' },
      }),
    [colors],
  );

  const handleBack = useCallback(() => {
    goBackWithOptionalReturn(router, returnTo, '/(app)/profile');
  }, [router, returnTo]);

  const handleItemPress = useCallback(
    (item: ShopItem) => {
      Haptics.selectionAsync();
      const ownedItem = isShopItemOwned(owned, item.key);
      if (ownedItem) {
        void equip.mutateAsync(item.key).catch(() => {
          Toast.show({ type: 'error', text1: 'Could not equip item' });
        });
        return;
      }
      setConfirmItem(item);
    },
    [owned, equip],
  );

  const handlePurchase = async () => {
    if (!confirmItem) return;
    try {
      await purchase.mutateAsync(confirmItem.key);
      setConfirmItem(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Toast.show({ type: 'error', text1: 'Not enough Sparks' });
    }
  };

  const themeColor = (key: string) =>
    ACCENT_THEME_CATALOG[key as AccentThemeKey]?.color ??
    (catalog.find((c) => c.key === key)?.metadata?.color as string) ??
    colors.primary;

  const titleTagline = (item: ShopItem) =>
    TITLE_CATALOG[item.key]?.tagline ?? (item.metadata?.tagline as string | undefined);

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} hitSlop={12} accessibilityLabel="Back">
          <IconChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text variant="heading">Shop</Text>
        <LiveSparksPill />
      </View>

      {isLoading ? (
        <ActivityIndicator style={{ marginTop: Spacing.xxl }} color={colors.primary} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text variant="heading">Accent themes</Text>
            <View style={styles.themeGrid}>
              {themes.map((item) => {
                const ownedItem = isShopItemOwned(owned, item.key);
                const active = activeAccent === item.key;
                const color = themeColor(item.key);
                return (
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => handleItemPress(item)}
                    style={{ alignItems: 'center', gap: 6, opacity: ownedItem ? 1 : 0.8 }}
                  >
                    <View
                      style={[
                        styles.themeSwatch,
                        {
                          backgroundColor: color,
                          borderWidth: active ? 3 : 0,
                          borderColor: colors.text,
                        },
                      ]}
                    >
                      {ownedItem && active ? <IconCheck size={22} color="#fff" /> : null}
                    </View>
                    <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
                      {item.name}
                    </Text>
                    {!ownedItem ? (
                      <SparkPriceTag price={item.price} />
                    ) : active ? (
                      <Text variant="micro" color={colors.primary} style={styles.equippedLabel}>
                        Equipped
                      </Text>
                    ) : (
                      <Text variant="micro" color={colors.success}>
                        Owned
                      </Text>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="heading">Avatar frames</Text>
            <View style={styles.borderRow}>
              {borders.map((item) => {
                const ownedItem = isShopItemOwned(owned, item.key);
                const def = BORDER_CATALOG[item.key];
                const borderColor = def?.color ?? colors.border;
                const equipped = profile?.equipped_border_key === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.borderItem, { opacity: ownedItem ? 1 : 0.7 }]}
                    onPress={() => handleItemPress(item)}
                  >
                    <Avatar
                      username={profile?.username}
                      uri={profile?.avatar_url}
                      size={48}
                      borderColor={borderColor}
                      borderWidth={def?.width ?? 3}
                    />
                    <Text variant="label">{item.name}</Text>
                    {ownedItem ? (
                      equipped ? (
                        <Text variant="micro" color={colors.primary} style={styles.equippedLabel}>
                          Equipped
                        </Text>
                      ) : (
                        <Text variant="micro" color={colors.success}>
                          Owned
                        </Text>
                      )
                    ) : (
                      <SparkPriceTag price={item.price} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <Text variant="heading">Titles</Text>
            <View style={styles.titleList}>
              {titles.map((item) => {
                const ownedItem = isShopItemOwned(owned, item.key);
                const label = TITLE_CATALOG[item.key]?.label ?? item.name;
                const tagline = titleTagline(item);
                const equipped = profile?.equipped_title_key === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    style={[styles.titleRow, equipped ? styles.titleRowEquipped : null]}
                    onPress={() => handleItemPress(item)}
                    activeOpacity={0.85}
                  >
                    <View style={{ flex: 1, gap: Spacing.sm }}>
                      <View style={styles.titleBadge}>
                        <Text variant="micro" color={colors.primary} style={{ fontWeight: '700' }}>
                          {label}
                        </Text>
                      </View>
                      {tagline ? (
                        <Text variant="body" color={colors.textSecondary}>
                          {tagline}
                        </Text>
                      ) : null}
                    </View>
                    {ownedItem ? (
                      equipped ? (
                        <Text variant="micro" color={colors.primary} style={styles.equippedLabel}>
                          Equipped
                        </Text>
                      ) : (
                        <Text variant="micro" color={colors.success}>
                          Owned
                        </Text>
                      )
                    ) : (
                      <SparkPriceTag price={item.price} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </ScrollView>
      )}

      <PurchaseConfirmSheet
        visible={!!confirmItem}
        item={confirmItem}
        profile={profile}
        sparksBalance={sparks}
        onConfirm={handlePurchase}
        onClose={() => setConfirmItem(null)}
        loading={purchase.isPending}
      />
    </SafeAreaView>
  );
}
