import React, { useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import Toast from 'react-native-toast-message';
import * as Haptics from 'expo-haptics';
import { useRouter, useLocalSearchParams, type Href } from 'expo-router';
import { Spacing, Radius, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { InlineFeedback } from '@/components/ui/InlineFeedback';
import { ProfileAvatar } from '@/components/ui/ProfileAvatar';
import { IconChevronLeft } from '@/components/icons/Icons';
import { useBlockedUsersPaged, useUnblockUser } from '@/hooks/useBlockUser';
import { goBackWithOptionalReturn } from '@/lib/navigationReturn';
import { useManualRefresh } from '@/hooks/useManualRefresh';

export default function BlockedUsersScreen() {
  const router = useRouter();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const blockedQuery = useBlockedUsersPaged();
  const blocked = useMemo(
    () => blockedQuery.data?.pages.flatMap((page) => page) ?? [],
    [blockedQuery.data?.pages],
  );
  const { isLoading, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = blockedQuery;
  const { refreshing, handleRefresh } = useManualRefresh(refetch);
  const unblock = useUnblockUser();
  const [actionError, setActionError] = React.useState('');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
          gap: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        nameCol: { flex: 1, minWidth: 0 },
        empty: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: Spacing.xl,
          gap: Spacing.sm,
        },
      }),
    [colors],
  );

  const handleUnblock = useCallback(
    (userId: string, displayName: string | null) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setActionError('');
      unblock.mutate({ blockedUserId: userId }, {
        onSuccess: () => {
          Toast.show({ type: 'success', text1: `${displayName ?? 'User'} unblocked` });
        },
        onError: () => {
          setActionError('Could not unblock this user. Please try again.');
        },
      });
    },
    [unblock],
  );

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            Haptics.selectionAsync();
            goBackWithOptionalReturn(router, returnTo, '/(app)/profile/settings' as Href);
          }}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <IconChevronLeft size={26} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text variant="headingLarge">Blocked users</Text>
          {!isLoading ? (
            <Text variant="micro" color={colors.textTertiary}>
              {blocked.length === 0
                ? 'No blocked users'
                : `${blocked.length} ${blocked.length === 1 ? 'user' : 'users'}`}
            </Text>
          ) : null}
        </View>
      </View>

      {isLoading && blocked.length === 0 ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <>
        {actionError ? (
          <InlineFeedback
            message={actionError}
            style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.sm }}
          />
        ) : null}
        <FlatList
          style={webScrollParentStyle}
          data={blocked}
          keyExtractor={(item) => item.id}
          onEndReached={() => {
            if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
          }}
          onEndReachedThreshold={0.35}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator color={colors.primary} /> : null
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.text}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                You haven't blocked anyone.
              </Text>
              <Text variant="bodySmall" color={colors.textTertiary} style={{ textAlign: 'center' }}>
                Blocked users can't see your posts or interact with you.
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <ProfileAvatar profile={item} size={40} />
              <View style={styles.nameCol}>
                <Text variant="body" numberOfLines={1}>
                  {item.display_name?.trim() || item.username}
                </Text>
                <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
                  @{item.username}
                </Text>
              </View>
              <Button
                size="sm"
                variant="secondary"
                loading={unblock.isPending}
                onPress={() => handleUnblock(item.id, item.display_name)}
              >
                Unblock
              </Button>
            </View>
          )}
        />
        </>
      )}
    </SafeAreaView>
  );
}
