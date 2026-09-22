import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { PostCard } from '../../../../components/feed/PostCard';
import { IconChevronLeft } from '../../../../components/icons/Icons';
import { Text } from '../../../../components/ui/Text';
import { Spacing, webScrollParentStyle } from '../../../../constants/theme';
import { useTheme } from '../../../../contexts/ThemeContext';
import { NavigationOriginProvider } from '../../../../contexts/NavigationOriginContext';
import { usePost } from '../../../../hooks/useProfile';
import { useUserEvent } from '../../../../hooks/useUserEvent';
import { goBackToExplicitReturn, sanitizeReturnTo, ROUTES } from '../../../../lib/navigationReturn';
import { postDetailHref } from '../../../../lib/routes';
import { hasUnlockedFeed } from '../../../../lib/participationGate';
import { TAB_SCREEN_SAFE_AREA_EDGES } from '../../../../lib/safeAreaLayout';

export default function PostDetailScreen() {
  const params = useLocalSearchParams<{
    id: string | string[];
    openComments?: string | string[];
    mentionCommentId?: string | string[];
    returnTo?: string | string[];
  }>();
  const postId = Array.isArray(params.id) ? params.id[0] : params.id;
  const openComments = Array.isArray(params.openComments)
    ? params.openComments[0]
    : params.openComments;
  const mentionCommentId = Array.isArray(params.mentionCommentId)
    ? params.mentionCommentId[0]
    : params.mentionCommentId;
  const parentReturn = sanitizeReturnTo(params.returnTo);
  const navigationOrigin = String(postDetailHref(postId, {
    openComments: openComments === '1', mentionCommentId,
    returnTo: parentReturn ? String(parentReturn) : undefined,
  }));
  const router = useRouter();
  const { colors } = useTheme();
  const { data: post, isLoading, error } = usePost(postId);
  const visiblePost = post?.id === postId ? post : null;
  const routeIsLoading = isLoading || (!!post && post.id !== postId);
  const { data: userEvent, isLoading: userEventLoading } = useUserEvent();
  const feedLocked = !hasUnlockedFeed(userEvent) && !userEventLoading;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row', alignItems: 'center', gap: Spacing.sm,
          paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline,
        },
        backHit: { padding: Spacing.xs },
        centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
        scroll: { flex: 1 },
        scrollContent: { paddingBottom: Spacing.xxl },
      }),
    [colors.background, colors.hairline],
  );

  return (
    <NavigationOriginProvider origin={navigationOrigin}>
    <SafeAreaView edges={TAB_SCREEN_SAFE_AREA_EDGES} style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackToExplicitReturn(router, params.returnTo, ROUTES.feed)}
          hitSlop={16}
          style={styles.backHit}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text variant="headingMedium" numberOfLines={1} style={{ flex: 1 }}>Post</Text>
      </View>
      {routeIsLoading ? (
        <View style={styles.centered}><ActivityIndicator color={colors.text} /></View>
      ) : error || !visiblePost ? (
        <View style={styles.centered}>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            This post is no longer available.
          </Text>
        </View>
      ) : (
        <ScrollView
          style={[styles.scroll, webScrollParentStyle]}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          scrollEventThrottle={Platform.OS === 'web' ? 16 : undefined}
        >
          <PostCard
            key={postId}
            post={visiblePost}
            blurred={feedLocked}
            initialCommentsOpen={openComments === '1'}
          />
        </ScrollView>
      )}
    </SafeAreaView>
    </NavigationOriginProvider>
  );
}
