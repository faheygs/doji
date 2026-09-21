import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  InteractionManager,
  type ViewToken,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { Spacing, Radius, webScrollParentStyle } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { TAB_SCREEN_SAFE_AREA_EDGES } from '../../lib/safeAreaLayout';
import { Text } from '../../components/ui/Text';
import { ProfileAvatar } from '../../components/ui/ProfileAvatar';
import { PostCard } from '../../components/feed/PostCard';
import { FeedSkeleton } from '../../components/feed/FeedSkeleton';
import { SkeletonSwap } from '../../components/ui/SkeletonSwap';
import { ErrorState } from '../../components/ui/ErrorState';
import { DojiHeaderBrand } from '../../components/branding/DojiHeaderBrand';
import { NotificationSheet } from '../../components/notifications/NotificationSheet';
import { ChallengeBanner } from '../../components/challenge/ChallengeBanner';
import { UpcomingDojiBanner } from '../../components/challenge/UpcomingDojiBanner';
import { IconBell } from '../../components/icons/Icons';
import { useNotificationCenterContext } from '../../contexts/NotificationCenterContext';
import { useUserEvent } from '../../hooks/useUserEvent';
import { useUpcomingDoji } from '../../hooks/useUpcomingDoji';
import { prefetchFeedAudience, useFeed, type FeedAudience } from '../../hooks/useFeed';
import { useAuthStore } from '../../stores/useAuthStore';
import { isChallengeLive } from '../../lib/challengeDay';
import { hasUnlockedFeed } from '../../lib/participationGate';
import type { Post } from '../../types/database';
import { useFocusedRealtimeInvalidation } from '../../hooks/useFocusedRealtimeInvalidation';
import { realtimeQueryRoots } from '../../lib/realtimeQueryRoots';
import { useFeedScreenStyles } from '../../components/feed/useFeedScreenStyles';
import { useFeedAudiencePreference } from '../../hooks/useFeedAudiencePreference';
import { useStableFeedPresentation } from '../../hooks/useStableFeedPresentation';
import { usePreparedFeedPosts } from '../../hooks/usePreparedFeedPosts';
import { FeedAudienceMenu } from '../../components/feed/FeedAudienceMenu';
import { usePost } from '../../hooks/useProfile';
import { InlineFeedback } from '../../components/ui/InlineFeedback';
export default function FeedScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    postId?: string | string[];
    openComments?: string | string[];
  }>();
  const pendingPostId = useMemo(() => {
    const raw = params.postId;
    return typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
  }, [params.postId]);
  const pendingOpenComments = useMemo(() => {
    const raw = params.openComments;
    const val = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : undefined;
    return val === '1' || val === 'true';
  }, [params.openComments]);
  const { colors } = useTheme();
  const styles = useFeedScreenStyles();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const { audience, selectAudience } = useFeedAudiencePreference(userId);
  useFocusedRealtimeInvalidation('feed:public', realtimeQueryRoots, audience === 'everyone');
  const [focusPostId, setFocusPostId] = useState<string | null>(null);
  const [focusedPost, setFocusedPost] = useState<Post | null>(null);
  const [focusedPostUnavailable, setFocusedPostUnavailable] = useState(false);
  const [visiblePostIds, setVisiblePostIds] = useState<ReadonlySet<string>>(() => new Set());
  const [focusOpenComments, setFocusOpenComments] = useState(false);
  const flatListRef = useRef<FlatList<Post>>(null);
  const deepLinkHandledRef = useRef<string | null>(null);
  const focusFeedIdentityRef = useRef<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { data: userEvent, isLoading: userEventLoading } = useUserEvent();
  const { data: upcomingDoji } = useUpcomingDoji();
  const feedUnlocked = userEventLoading ? undefined : hasUnlockedFeed(userEvent);
  const {
    data: feedPages,
    isLoading: feedLoading,
    isFetching: feedFetching,
    isFetchedAfterMount: feedFetchedAfterMount,
    isError: feedError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    refetch,
  } = useFeed(audience, feedUnlocked, userEvent?.daily_event_id);
  const queryClient = useQueryClient();
  const profile = useAuthStore((s) => s.profile);
  const {
    unreadCount: notificationUnread,
    markBellOpened,
    dismissItem: dismissNotificationItem,
    clearNotificationHistory,
    items: notificationItems,
    isLoading: notificationsLoading,
    isClearing: notificationsClearing,
    markItemsSeen: markNotificationItemsSeen,
    markScopesSeen,
  } = useNotificationCenterContext();
  const outerStyle = useMemo(() => [styles.container, webScrollParentStyle], [styles.container]);
  const [refreshing, setRefreshing] = useState(false);
  const refreshWorkRef = useRef<Promise<unknown> | null>(null);
  const challengeIsLive = useMemo(() => {
    if (!userEvent?.daily_event?.fires_at) return false;
    return isChallengeLive(userEvent.daily_event.fires_at);
  }, [userEvent]);
  useFocusEffect(
    useCallback(() => {
      if (!challengeIsLive || !userEvent?.daily_event_id) return;
      markScopesSeen([{ scope_kind: 'daily_event', scope_id: userEvent.daily_event_id }]);
    }, [challengeIsLive, markScopesSeen, userEvent?.daily_event_id]),
  );
  const feedIdentity = `${userId ?? ''}:${userEvent?.daily_event_id ?? ''}:${audience}`;
  const latestPosts = useMemo(() => feedPages?.pages.flat() ?? [], [feedPages]);
  const presentationReadyPosts = usePreparedFeedPosts(
    latestPosts,
    feedIdentity,
    feedUnlocked === true,
    feedPages !== undefined,
  );
  const scrollFeedToTop = useCallback(
    () => flatListRef.current?.scrollToOffset({ offset: 0, animated: true }),
    [],
  );
  const {
    posts,
    pendingNewPostCount,
    revealNewPosts,
    onScroll: handleFeedScroll,
  } = useStableFeedPresentation(presentationReadyPosts, feedIdentity, scrollFeedToTop);
  const postAlreadyLoaded = useMemo(
    () => Boolean(pendingPostId && posts.some((post) => post.id === pendingPostId)),
    [pendingPostId, posts],
  );
  const {
    data: resolvedFocusedPost,
    isFetched: focusedPostFetched,
    isError: focusedPostError,
  } = usePost(pendingPostId && !postAlreadyLoaded ? pendingPostId : undefined);
  const displayedPosts = useMemo(() => {
    if (!focusedPost || posts.some((post) => post.id === focusedPost.id)) return posts;
    return [focusedPost, ...posts];
  }, [focusedPost, posts]);
  const showInitialFeedSkeleton =
    posts.length === 0 &&
    !refreshing &&
    (userEventLoading ||
      feedLoading ||
      (feedFetching && !feedFetchedAfterMount));
  useEffect(() => {
    if (!userId || !userEvent?.daily_event_id || feedUnlocked === undefined || !feedPages) return;
    // Media cards resolve private URLs after their social records render. Do
    // not compete with those visible-image requests by warming an invisible
    // audience. Text-only feeds retain the inexpensive adjacent-tab prefetch.
    if (posts.some((post) => post.photo_url || post.front_photo_url || post.video_url)) return;
    const nextAudience: FeedAudience = audience === 'friends' ? 'everyone' : 'friends';
    const task = InteractionManager.runAfterInteractions(() => {
      void prefetchFeedAudience(queryClient, {
        userId,
        dailyEventId: userEvent.daily_event_id,
        audience: nextAudience,
        unlocked: feedUnlocked,
      });
    });
    return () => task.cancel();
  }, [audience, feedPages, feedUnlocked, posts, queryClient, userEvent?.daily_event_id, userId]);
  useEffect(() => {
    if (!pendingPostId) {
      deepLinkHandledRef.current = null;
      return;
    }
    if (deepLinkHandledRef.current === pendingPostId) return;
    const loadedPost = posts.find((post) => post.id === pendingPostId);
    const targetPost = loadedPost ?? resolvedFocusedPost ?? null;
    if (targetPost) {
      deepLinkHandledRef.current = pendingPostId;
      setFocusedPostUnavailable(false);
      setFocusedPost(targetPost);
      setFocusPostId(pendingPostId);
      setFocusOpenComments(pendingOpenComments);
      requestAnimationFrame(() => {
        const index = loadedPost ? posts.findIndex((post) => post.id === pendingPostId) : 0;
        flatListRef.current?.scrollToIndex({ index: Math.max(0, index), animated: true });
      });
      router.setParams({ postId: undefined, openComments: undefined, mentionCommentId: undefined });
      return;
    }
    if (focusedPostFetched || focusedPostError) {
      deepLinkHandledRef.current = pendingPostId;
      setFocusedPostUnavailable(true);
      router.setParams({ postId: undefined, openComments: undefined, mentionCommentId: undefined });
    }
  }, [
    focusedPostError,
    focusedPostFetched,
    pendingOpenComments,
    pendingPostId,
    posts,
    resolvedFocusedPost,
    router,
  ]);

  useEffect(() => {
    if (focusFeedIdentityRef.current === null) {
      focusFeedIdentityRef.current = feedIdentity;
      return;
    }
    if (focusFeedIdentityRef.current !== feedIdentity) {
      focusFeedIdentityRef.current = feedIdentity;
      setFocusedPost(null);
      setFocusPostId(null);
      setFocusOpenComments(false);
    }
  }, [feedIdentity]);

  const shouldBlur = !hasUnlockedFeed(userEvent) && !userEventLoading;
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (!refreshWorkRef.current) {
        refreshWorkRef.current = Promise.allSettled([
          refetch({ cancelRefetch: false }),
          queryClient.refetchQueries({
            predicate: (query) => {
              const root = query.queryKey[0];
              return root === 'userEvent' || root === 'pollResults';
            },
            type: 'active',
          }),
        ]).finally(() => {
          refreshWorkRef.current = null;
        });
      }

      // Native RefreshControl otherwise spins forever when the radio changes
      // networks while a request is in flight. The authoritative queries keep
      // reconciling in the background; the UI never becomes a blocking state.
      await Promise.race([
        refreshWorkRef.current,
        new Promise<void>((resolve) => {
          setTimeout(resolve, 2_500);
        }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [refetch, queryClient]);

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleScrollToIndexFailed = useCallback(
    (info: { averageItemLength: number; index: number }) => {
      flatListRef.current?.scrollToOffset({
        offset: Math.max(0, info.averageItemLength * info.index),
        animated: true,
      });
    },
    [],
  );

  const handleOpenProfile = useCallback(() => {
    Haptics.selectionAsync();
    router.push('/(app)/profile' as never);
  }, [router]);

  const handleOpenNotifications = useCallback(() => {
    Haptics.selectionAsync();
    setNotificationsOpen(true);
  }, []);

  const renderPost = useCallback(
    ({ item }: { item: Post }) => (
      <PostCard
        post={item}
        blurred={shouldBlur}
        realtimeActive={visiblePostIds.has(item.id)}
        feedAudience={audience}
        initialCommentsOpen={focusPostId === item.id && focusOpenComments}
      />
    ),
    [shouldBlur, audience, focusPostId, focusOpenComments, visiblePostIds],
  );

  const onViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken<Post>[] }) => {
      const next = new Set(
        viewableItems
          .filter((token) => token.isViewable && token.item?.id)
          .map((token) => token.item.id),
      );
      setVisiblePostIds((current) => {
        if (current.size === next.size && [...current].every((id) => next.has(id))) return current;
        return next;
      });
    },
  ).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 15 }).current;

  const keyExtractorPost = useCallback((p: Post) => p.id, []);

  const refreshColors = useMemo(() => [colors.text], [colors.text]);
  const FeedChrome = useCallback(
    () => (
      <View style={styles.feedChrome}>
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
                <ProfileAvatar profile={profile} size={36} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
        <FeedAudienceMenu audience={audience} onSelect={selectAudience} />
      </View>
    ),
    [styles, colors, notificationUnread, profile, handleOpenProfile,
      handleOpenNotifications, audience, selectAudience],
  );
  const ListHeader = useCallback(
    () => (
      <View style={styles.listHeader}>
        {focusedPostUnavailable ? (
          <InlineFeedback
            title="Post unavailable"
            message="It may have expired or been removed."
            style={{ marginHorizontal: Spacing.md, marginBottom: Spacing.sm }}
          />
        ) : null}
        {upcomingDoji ? (
          <UpcomingDojiBanner firesAt={upcomingDoji.fires_at} />
        ) : userEventLoading ? (
          <View
            pointerEvents="none"
            style={{ paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm }}
            accessibilityLabel="Loading today's challenge"
          >
            <View
              style={{
                height: 64,
                borderRadius: Radius.md,
                backgroundColor: colors.surfaceMuted,
              }}
            />
          </View>
        ) : (
          <ChallengeBanner userEvent={userEvent ?? null} />
        )}
      </View>
    ),
    [styles, colors, focusedPostUnavailable, userEvent, userEventLoading, upcomingDoji],
  );

  const emptyCopy = useMemo(() => {
    if (audience === 'friends') {
      return {
        emptyHeading: 'Nothing from friends yet',
        emptyBody: 'Add friends to see their responses here.',
      };
    }
    if (!userEvent) {
      return {
        emptyHeading: 'Challenge incoming',
        emptyBody: "Today's challenge hasn't dropped yet.",
      };
    }
    if (challengeIsLive) {
      return {
        emptyHeading: 'Nothing yet',
        emptyBody: 'Be the first to respond.',
      };
    }
    return {
      emptyHeading: 'Challenge incoming',
      emptyBody: 'The challenge drops soon.',
    };
  }, [audience, userEvent, challengeIsLive]);

  const { emptyHeading, emptyBody } = emptyCopy;

  const ListEmptyComponent = useMemo(
    () => (
      <View style={styles.empty}>
        <Text variant="headingLarge">{emptyHeading}</Text>
        {emptyBody ? (
          <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
            {emptyBody}
          </Text>
        ) : null}
      </View>
    ),
    [styles.empty, styles.emptyText, colors.textSecondary, emptyHeading, emptyBody],
  );

  if (feedError && posts.length === 0) {
    return (
      <SafeAreaView edges={TAB_SCREEN_SAFE_AREA_EDGES} style={outerStyle}>
        <FeedChrome />
        <ErrorState
          title="Couldn't load your feed"
          message="Check your connection and try again."
          onRetry={() => void refetch()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={TAB_SCREEN_SAFE_AREA_EDGES} style={outerStyle}>
      <FeedChrome />
      <SkeletonSwap
        loading={showInitialFeedSkeleton}
        skeleton={
          <>
            <ListHeader />
            <FeedSkeleton challenge={userEvent?.challenge} />
          </>
        }
      >
        <FlatList
          ref={flatListRef}
          style={webScrollParentStyle}
          data={displayedPosts}
          keyExtractor={keyExtractorPost}
          renderItem={renderPost}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          onScrollToIndexFailed={handleScrollToIndexFailed}
          onScroll={handleFeedScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={ListHeader}
          ListEmptyComponent={ListEmptyComponent}
          onEndReached={handleEndReached}
          onEndReachedThreshold={0.35}
          initialNumToRender={6}
          maxToRenderPerBatch={4}
          windowSize={7}
          removeClippedSubviews={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.text}
              colors={refreshColors}
            />
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
        />
      </SkeletonSwap>

      {pendingNewPostCount > 0 ? (
        <TouchableOpacity
          onPress={revealNewPosts}
          style={styles.newPostsButton}
          accessibilityRole="button"
          accessibilityLabel={`Show ${pendingNewPostCount} new ${pendingNewPostCount === 1 ? 'post' : 'posts'}`}
        >
          <Text variant="label" style={styles.newPostsText}>
            {pendingNewPostCount === 1 ? 'New post' : `${pendingNewPostCount} new posts`}
          </Text>
        </TouchableOpacity>
      ) : null}

      <NotificationSheet
        visible={notificationsOpen}
        items={notificationItems}
        isLoading={notificationsLoading}
        isClearing={notificationsClearing}
        onDismissItem={dismissNotificationItem}
        onClearHistory={clearNotificationHistory}
        onItemsVisible={markNotificationItemsSeen}
        onClose={() => {
          void markBellOpened();
          setNotificationsOpen(false);
        }}
      />
    </SafeAreaView>
  );
}
