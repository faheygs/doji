import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Keyboard, StyleSheet, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, usePathname, useLocalSearchParams, type Href } from 'expo-router';
import { Spacing, webScrollParentStyle } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { TAB_SCREEN_SAFE_AREA_EDGES } from '../../../lib/safeAreaLayout';
import { Text } from '../../../components/ui/Text';
import { SearchField } from '../../../components/ui/SearchField';
import { ListRowsSkeleton } from '../../../components/ui/LoadingSkeletons';
import { SkeletonSwap } from '../../../components/ui/SkeletonSwap';
import { IconChevronLeft } from '../../../components/icons/Icons';
import { useSearchUsers } from '../../../hooks/useProfile';
import { useAuthStore } from '../../../stores/useAuthStore';
import { goBackToExplicitReturn, hrefPreservingReturnTo } from '../../../lib/navigationReturn';
import { prepareProfileHref } from '../../../lib/profileNavigation';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { useRecentProfileSearches } from '../../../hooks/useRecentProfileSearches';
import { RecentProfileSearchList } from '../../../components/friends/RecentProfileSearchList';
import { UserSearchResult } from '../../../components/friends/UserSearchResult';
import type { RecentProfileSearch } from '../../../lib/recentProfileSearches';

export default function AddFriendsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const navigationOrigin = useMemo(
    () => String(hrefPreservingReturnTo(pathname, returnTo)),
    [pathname, returnTo],
  );
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const debouncedQuery = useDebouncedValue(trimmedQuery, 250);
  const { data: results = [], isLoading } = useSearchUsers(debouncedQuery);
  const currentProfile = useAuthStore((s) => s.profile);
  const { recents, record, remove, clear } = useRecentProfileSearches(currentProfile?.id);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
        },
        searchContainer: {
          paddingHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
        },
        list: {
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        empty: {
          alignItems: 'center',
          paddingTop: Spacing.xxl,
          gap: Spacing.md,
        },
      }),
    [colors.background],
  );

  const filteredResults = useMemo(
    () => debouncedQuery === trimmedQuery
      ? results.filter((result) => result.id !== currentProfile?.id)
      : [],
    [currentProfile?.id, debouncedQuery, results, trimmedQuery],
  );
  const openProfile = useCallback(
    (profile: RecentProfileSearch) => {
      Keyboard.dismiss();
      setQuery('');
      record(profile);
      const href = prepareProfileHref(profile.username, navigationOrigin);
      if (href) router.push(href);
    },
    [navigationOrigin, record, router],
  );

  return (
    <SafeAreaView
      edges={TAB_SCREEN_SAFE_AREA_EDGES}
      style={[styles.container, webScrollParentStyle]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackToExplicitReturn(router, returnTo, '/(app)/friends' as Href)}
          hitSlop={16}
        >
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text variant="headingLarge">Find people</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <SearchField
          accessibilityLabel="Search people by username"
          placeholder="Search people…"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
      </View>

      {!trimmedQuery ? (
        <RecentProfileSearchList
          recents={recents}
          onSelect={openProfile}
          onRemove={remove}
          onClear={clear}
        />
      ) : (
        <SkeletonSwap
          loading={trimmedQuery.length >= 2 && (debouncedQuery !== trimmedQuery || isLoading)}
          skeleton={<ListRowsSkeleton rows={4} label="Searching people" />}
        >
          <FlatList
            style={webScrollParentStyle}
            data={filteredResults}
            removeClippedSubviews={false}
            keyExtractor={(u) => u.id}
            contentContainerStyle={styles.list}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => <UserSearchResult user={item} onOpen={openProfile} />}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text variant="body" color={colors.textSecondary}>
                  {trimmedQuery.length < 2
                    ? 'Keep typing to search'
                    : `No users found for "${trimmedQuery}"`}
                </Text>
              </View>
            }
          />
        </SkeletonSwap>
      )}
    </SafeAreaView>
  );
}
