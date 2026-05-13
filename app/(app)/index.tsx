import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  SafeAreaView,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, webScrollParentStyle } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Avatar } from '../../components/ui/Avatar';
import { PostCard } from '../../components/feed/PostCard';
import { ErrorState } from '../../components/ui/ErrorState';
import { DojiHeaderBrand } from '../../components/branding/DojiHeaderBrand';
import { NotificationSheet } from '../../components/notifications/NotificationSheet';
import { ChallengeBanner } from '../../components/challenge/ChallengeBanner';
import { FeedToggle, type FeedFilter } from '../../components/feed/FeedToggle';
import { IconBell } from '../../components/icons/Icons';
import { useNotificationCenter } from '../../hooks/useNotificationCenter';
import { useUserEvent } from '../../hooks/useUserEvent';
import { useFeed } from '../../hooks/useFeed';
import { useAuthStore } from '../../stores/useAuthStore';
import type { Post } from '../../types/database';

export default function FeedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('friends');

  const {
    data: feedPages,
    isLoading: feedLoading,
    isError: feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useFeed(feedFilter);
  const { data: userEvent, isLoading: userEventLoading, isError: userEventError } = useUserEvent();
  const profile = useAuthStore((s) => s.profile);
  const {
    unreadCount: notificationUnread,
    markAllSeenUpToNow,
    items: notificationItems,
    isLoading: notificationsLoading,
  } = useNotificationCenter();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        listHeader: {
          gap: Spacing.sm,
          paddingBottom: Spacing.xs,
        },
        feedTopBar: {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
          paddingBottom: Spacing.sm,
        },
        feedTopInner: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.xs,
        },
        topActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        actionHit: {
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.xs,
        },
        bellWrap: {
          position: 'relative',
        },
        badge: {
          position: 'absolute',
          top: 2,
          right: -2,
          minWidth: 18,
          height: 18,
          borderRadius: 9,
          paddingHorizontal: 5,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.error,
          pointerEvents: 'none',
        },
        badgeText: {
          color: '#FFFFFF',
          fontSize: 11,
          fontWeight: '700',
        },
        streakPill: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          backgroundColor: colors.primaryPale,
          paddingHorizontal: Spacing.sm,
          paddingVertical: 4,
          borderRadius: Radius.full,
        },
        toggleWrapper: {
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.xs,
        },
        list: {
          paddingBottom: Spacing.xxl,
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        empty: {
          alignItems: 'center',
          paddingTop: Spacing.xxl * 2,
          gap: Spacing.md,
          paddingHorizontal: Spacing.xl,
        },
        emptyText: {
          textAlign: 'center',
          lineHeight: 22,
        },
      }),
    [colors],
  );

  const outerStyle = useMemo(
    () => [styles.container, webScrollParentStyle],
    [styles.container],
  );

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const posts = useMemo(() => feedPages?.pages.flat() ?? [], [feedPages]);

  const hasPosted = userEvent?.status === 'completed' || userEvent?.status === 'late';
  const shouldBlur = !hasPosted && !userEventLoading;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleOpenProfile = useCallback(() => {
    Haptics.selectionAsync();
    router.push('/(app)/profile');
  }, [router]);

  const handleOpenNotifications = useCallback(() => {
    Haptics.selectionAsync();
    setNotificationsOpen(true);
  }, []);

  const renderPost = useCallback(
    ({ item }: { item: Post }) => <PostCard post={item} blurred={shouldBlur} />,
    [shouldBlur],
  );

  const keyExtractorPost = useCallback((p: Post) => p.id, []);

  const streak = profile?.current_streak ?? 0;

  const ListHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.feedTopBar}>
          <View style={styles.feedTopInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <DojiHeaderBrand />
              {streak > 0 && (
                <View style={styles.streakPill}>
                  <Text variant="micro" color={colors.primary}>
                    🔥 {streak}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.topActions}>
              <TouchableOpacity
                onPress={handleOpenNotifications}
                style={[styles.actionHit, styles.bellWrap]}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel={
                  notificationUnread > 0
                    ? `${notificationUnread} notification alerts`
                    : 'Notifications'
                }
              >
                <IconBell size={26} color={colors.text} />
                {notificationUnread > 0 ? (
                  <View style={styles.badge}>
                    <Text variant="bodySmall" style={styles.badgeText}>
                      {notificationUnread > 99 ? '99+' : notificationUnread}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleOpenProfile}
                style={styles.actionHit}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Your profile"
              >
                <Avatar uri={profile?.avatar_url} username={profile?.username} size={36} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.toggleWrapper}>
          <FeedToggle value={feedFilter} onChange={setFeedFilter} />
        </View>

        {userEventLoading ? (
          <View
            style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}
            accessibilityLabel="Loading today's challenge"
          >
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <ChallengeBanner userEvent={userEvent ?? null} />
        )}
      </View>
    ),
    [
      styles,
      colors,
      streak,
      feedFilter,
      notificationUnread,
      profile?.avatar_url,
      profile?.username,
      handleOpenProfile,
      handleOpenNotifications,
      userEvent,
      userEventLoading,
    ],
  );

  const ListEmptyComponent = useMemo(
    () => (
      <View style={styles.empty}>
        <Text variant="headingLarge">Nothing yet</Text>
        <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
          {feedFilter === 'friends'
            ? "No friends have posted yet.\nBe the first!"
            : 'No one has posted yet.\nBe the first to respond!'}
        </Text>
      </View>
    ),
    [styles.empty, styles.emptyText, colors.textSecondary, feedFilter],
  );

  if (feedError || userEventError) {
    return (
      <SafeAreaView style={outerStyle}>
        {ListHeader}
        <ErrorState
          title="Couldn't load your feed"
          message="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  if (feedLoading && posts.length === 0) {
    return (
      <SafeAreaView style={outerStyle}>
        {ListHeader}
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={outerStyle}>
      <FlatList
        style={webScrollParentStyle}
        data={posts}
        keyExtractor={keyExtractorPost}
        renderItem={renderPost}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmptyComponent}
        onEndReached={handleEndReached}
        onEndReachedThreshold={0.35}
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.text}
            colors={[colors.text]}
          />
        }
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />

      <NotificationSheet
        visible={notificationsOpen}
        items={notificationItems}
        isLoading={notificationsLoading}
        onClose={() => {
          void markAllSeenUpToNow();
          setNotificationsOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
