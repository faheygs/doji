import React, { useState, useCallback, useMemo, useEffect } from 'react';
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
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { Spacing, webScrollParentStyle } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../../components/ui/Text';
import { Avatar } from '../../components/ui/Avatar';
import { PostCard } from '../../components/feed/PostCard';
import { ErrorState } from '../../components/ui/ErrorState';
import { DojiHeaderBrand } from '../../components/branding/DojiHeaderBrand';
import { NotificationSheet } from '../../components/notifications/NotificationSheet';
import { ChallengeBanner } from '../../components/challenge/ChallengeBanner';
import { IconBell } from '../../components/icons/Icons';
import { useNotificationCenter } from '../../hooks/useNotificationCenter';
import { useUserEvent } from '../../hooks/useUserEvent';
import { useFeed } from '../../hooks/useFeed';
import { useAuthStore } from '../../stores/useAuthStore';
import type { Post } from '../../types/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

export default function FeedScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const {
    data: feedPages,
    isLoading: feedLoading,
    isError: feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useFeed();
  const queryClient = useQueryClient();
  const {
    data: userEvent,
    isLoading: userEventLoading,
    isError: userEventError,
    refetch: refetchUserEvent,
  } = useUserEvent();
  const profile = useAuthStore((s) => s.profile);
  const {
    unreadCount: notificationUnread,
    markBellOpened,
    dismissItem: dismissNotificationItem,
    clearNotificationHistory,
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
        feedHeading: {
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.sm,
          paddingBottom: Spacing.xs,
          alignItems: 'center',
        },
        feedTitle: {
          textAlign: 'center',
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

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const key = '@doit/first-home-push-prompt';
    void (async () => {
      try {
        const done = await AsyncStorage.getItem(key);
        if (done) return;
        const Notifications = await import('expo-notifications');
        const { status } = await Notifications.getPermissionsAsync();
        if (status === 'undetermined') {
          await Notifications.requestPermissionsAsync();
        }
        const { status: after } = await Notifications.getPermissionsAsync();
        if (after === 'granted') {
          const uid = useAuthStore.getState().session?.user?.id;
          if (uid) {
            const projectId = Constants.expoConfig?.extra?.eas?.projectId;
            const tokenRes = await Notifications.getExpoPushTokenAsync(
              projectId ? { projectId } : undefined,
            );
            const tokenStr =
              tokenRes && typeof tokenRes === 'object' && 'data' in tokenRes
                ? (tokenRes as { data: string }).data
                : String(tokenRes);
            await useAuthStore.getState().updateProfile({ notification_token: tokenStr });
          }
        }
      } catch {
        /* ignore */
      } finally {
        await AsyncStorage.setItem(key, '1');
      }
    })();
  }, []);

  const posts = useMemo(() => feedPages?.pages.flat() ?? [], [feedPages]);

  const hasPosted = userEvent?.status === 'completed' || userEvent?.status === 'late';
  const shouldBlur = !hasPosted && !userEventLoading;

  const firesAt = userEvent?.daily_event?.fires_at;
  const challengeIsLive = firesAt ? firesAt <= new Date().toISOString() : false;

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        refetch(),
        queryClient.invalidateQueries({ queryKey: ['userEvent'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, queryClient]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleOpenProfile = useCallback(() => {
    Haptics.selectionAsync();
    router.push('/(app)/profile' as Href);
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

  const ListHeader = useMemo(
    () => (
      <View style={styles.listHeader}>
        <View style={styles.feedTopBar}>
          <View style={styles.feedTopInner}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
              <DojiHeaderBrand />
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

        <View style={styles.feedHeading} accessibilityRole="header">
          <Text variant="headingLarge" style={styles.feedTitle}>
            {"Today's feed"}
          </Text>
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
      notificationUnread,
      profile?.avatar_url,
      profile?.username,
      handleOpenProfile,
      handleOpenNotifications,
      userEvent,
      userEventLoading,
    ],
  );

  const emptyHeading = !userEvent
    ? "Challenge incoming"
    : challengeIsLive
      ? "Nothing yet"
      : "Challenge incoming";

  const emptyBody = !userEvent
    ? "Today's challenge hasn't dropped yet.\nCheck back soon."
    : challengeIsLive
      ? "Be the first to respond!"
      : "The challenge drops soon.\nBe ready to go first.";

  const ListEmptyComponent = useMemo(
    () => (
      <View style={styles.empty}>
        <Text variant="headingLarge">{emptyHeading}</Text>
        <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
          {emptyBody}
        </Text>
      </View>
    ),
    [styles.empty, styles.emptyText, colors.textSecondary, emptyHeading, emptyBody],
  );

  if (feedError || userEventError) {
    return (
      <SafeAreaView style={outerStyle}>
        {ListHeader}
        <ErrorState
          title="Couldn't load your feed"
          message="Check your connection and try again."
          onRetry={() => {
            void refetch();
            void refetchUserEvent();
          }}
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
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      />

      <NotificationSheet
        visible={notificationsOpen}
        items={notificationItems}
        isLoading={notificationsLoading}
        onDismissItem={dismissNotificationItem}
        onClearHistory={clearNotificationHistory}
        onClose={() => {
          void markBellOpened();
          setNotificationsOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
