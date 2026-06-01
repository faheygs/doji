import React, { useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useRouter, usePathname, useLocalSearchParams } from 'expo-router';
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
import { IconChevronLeft } from '@/components/icons/Icons';
import { useAuthStore } from '@/stores/useAuthStore';
import { useOwnedShopItems, useEquipShopItem, isShopItemOwned } from '@/hooks/useShop';
import { goBackWithOptionalReturn, hrefWithReturnTo } from '@/lib/navigationReturn';

export default function AppearanceScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors, isDark, setPreference, accentTheme, setAccentTheme } = useTheme();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { data: owned = [] } = useOwnedShopItems(userId);
  const equip = useEquipShopItem();

  const selectableThemes = useMemo(() => {
    const defaultTheme = ACCENT_THEME_CATALOG[DEFAULT_ACCENT_THEME];
    const purchased = Object.values(ACCENT_THEME_CATALOG).filter(
      (t) => t.key !== DEFAULT_ACCENT_THEME && isShopItemOwned(owned, t.key),
    );
    return [defaultTheme, ...purchased];
  }, [owned]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
        },
        group: {
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.lg,
          backgroundColor: colors.surfaceElevated,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          padding: Spacing.md,
          gap: Spacing.md,
        },
        themeGrid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Spacing.md,
          paddingHorizontal: Spacing.lg,
          marginTop: Spacing.md,
        },
        swatch: {
          width: 56,
          height: 56,
          borderRadius: Radius.md,
          alignItems: 'center',
          justifyContent: 'center',
        },
        shopLink: {
          marginHorizontal: Spacing.lg,
          marginTop: Spacing.lg,
          padding: Spacing.md,
          borderRadius: Radius.md,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
        },
      }),
    [colors],
  );

  const handleThemeToggle = useCallback(
    (value: boolean) => {
      Haptics.selectionAsync();
      void setPreference(value ? 'dark' : 'light');
    },
    [setPreference],
  );

  const handleAccent = useCallback(
    (key: AccentThemeKey) => {
      Haptics.selectionAsync();
      void setAccentTheme(key);
      if (key !== DEFAULT_ACCENT_THEME && isShopItemOwned(owned, key)) {
        void equip.mutateAsync(key).catch(() => {});
      }
    },
    [setAccentTheme, equip, owned],
  );

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackWithOptionalReturn(router, returnTo, '/(app)/profile')}
          hitSlop={12}
          accessibilityLabel="Back"
        >
          <IconChevronLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text variant="heading">Appearance</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: Spacing.xxl }}>
        <View style={styles.group}>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Text variant="body" style={{ fontWeight: '600' }}>
                Dark mode
              </Text>
              <Text variant="micro" color={colors.textTertiary}>
                Use dark background
              </Text>
            </View>
            <Switch
              value={isDark}
              onValueChange={handleThemeToggle}
              trackColor={{ false: colors.border, true: colors.primary }}
            />
          </View>
        </View>

        <Text variant="label" color={colors.textTertiary} style={{ marginLeft: Spacing.lg, marginTop: Spacing.lg }}>
          ACCENT COLOR
        </Text>
        <View style={styles.themeGrid}>
          {selectableThemes.map((theme) => {
            const active = accentTheme === theme.key;
            const isDefault = theme.key === DEFAULT_ACCENT_THEME;
            return (
              <TouchableOpacity
                key={theme.key}
                onPress={() => handleAccent(theme.key)}
                style={{ alignItems: 'center', gap: 6, width: 68 }}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: theme.color,
                      borderWidth: active ? 3 : 0,
                      borderColor: colors.text,
                    },
                  ]}
                />
                <Text variant="micro" color={colors.textTertiary} style={{ textAlign: 'center' }}>
                  {theme.name}
                </Text>
                {isDefault ? (
                  <Text variant="micro" color={colors.textTertiary}>
                    Default
                  </Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {selectableThemes.length === 1 ? (
          <Text variant="body" color={colors.textSecondary} style={{ marginHorizontal: Spacing.lg, marginTop: Spacing.md }}>
            Buy accent themes in the Shop to unlock more colors.
          </Text>
        ) : null}

        <TouchableOpacity
          style={styles.shopLink}
          onPress={() => router.push(hrefWithReturnTo('/(app)/profile/shop', pathname))}
        >
          <Text variant="body" color={colors.primary} style={{ fontWeight: '600', textAlign: 'center' }}>
            Browse more themes in the Shop →
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
