import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { View, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useRouter, usePathname } from 'expo-router';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useAuthStore } from '../../stores/useAuthStore';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { ReactionBar } from './ReactionBar';
import { PostCommentsSheet } from './PostCommentsSheet';
import { PollResultCard } from './PollResultCard';
import { ChallengeTypeGlyph } from '../challenge/ChallengeTypeGlyph';
import { PostQuestionBlock, PostAnswerBlock, PostPhotoPrompt } from './PostContentBlocks';
import { challengeKindLabel } from '../../lib/challengeDisplay';
import { IconLock, IconMoreVertical } from '../icons/Icons';
import { ReportSheet } from './ReportSheet';
import { Post } from '../../types/database';
import { formatRelativeTime } from '../../utils/time';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
import { getEquippedBorder } from '../../lib/cosmetics';
import type { FeedAudience } from '../../lib/feedAudience';
import { AppVideo } from '../ui/AppVideo';
import { usePostRealtimeInvalidation } from '../../hooks/usePostRealtimeInvalidation';
import { usePostCardStyles } from './usePostCardStyles';

type Props = {
  post: Post;
  blurred: boolean;
  realtimeActive?: boolean;
  feedAudience?: FeedAudience;
  initialCommentsOpen?: boolean;
};
function reactionBreakdownSig(p: Post): string {
  return Object.entries(p.reaction_breakdown ?? {})
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}
export function postsVisuallyEqual(a: Post, b: Post): boolean {
  if (
    a.id !== b.id ||
    a.type !== b.type ||
    a.selected_option_index !== b.selected_option_index ||
    a.reaction_count !== b.reaction_count ||
    a.comment_count !== b.comment_count ||
    (a.my_reactions ?? []).join() !== (b.my_reactions ?? []).join() ||
    reactionBreakdownSig(a) !== reactionBreakdownSig(b) ||
    a.photo_url !== b.photo_url ||
    a.front_photo_url !== b.front_photo_url ||
    a.video_url !== b.video_url ||
    a.caption !== b.caption ||
    a.created_at !== b.created_at ||
    a.is_late !== b.is_late || a.comments_disabled !== b.comments_disabled ||
    Boolean(a.is_community_poll) !== Boolean(b.is_community_poll)
  ) {
    return false;
  }
  const pa = a.profile;
  const pb = b.profile;
  if (
    pa?.avatar_url !== pb?.avatar_url ||
    pa?.username !== pb?.username ||
    pa?.equipped_border_key !== pb?.equipped_border_key
  ) {
    return false;
  }
  const ac = a.challenge;
  const bc = b.challenge;
  if (ac?.id !== bc?.id || ac?.title !== bc?.title || ac?.category !== bc?.category || ac?.type !== bc?.type)
    return false;
  return true;
}

function PostCardImpl({
  post,
  blurred,
  realtimeActive = true,
  feedAudience = 'everyone',
  initialCommentsOpen = false,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const styles = usePostCardStyles();
  const meId = useAuthStore((s) => s.session?.user?.id);
  const isOwnPost = meId != null && post.user_id === meId;
  const equippedBorder = getEquippedBorder(post.profile);
  const [showFront, setShowFront] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(initialCommentsOpen);
  const [reportOpen, setReportOpen] = useState(false);
  const hasVideo = Boolean(post.video_url && !blurred);
  usePostRealtimeInvalidation(post.id, !blurred && realtimeActive, feedAudience);

  useEffect(() => {
    if (initialCommentsOpen) setCommentsOpen(true);
  }, [initialCommentsOpen, post.id]);

  const openComments = useCallback(() => setCommentsOpen(true), []);
  const closeComments = useCallback(() => setCommentsOpen(false), []);

  const handleProfilePress = useCallback(() => {
    Haptics.selectionAsync();
    if (post.profile?.username) {
      router.push(hrefWithReturnTo(`/(app)/member/${post.profile.username}`, pathname));
    }
  }, [router, post.profile?.username, pathname]);

  const handleImageToggle = useCallback(() => {
    if (post.front_photo_url && !hasVideo) {
      Haptics.selectionAsync();
      setShowFront((v) => !v);
    }
  }, [post.front_photo_url, hasVideo]);

  const displayUri =
    showFront && post.front_photo_url ? post.front_photo_url : post.photo_url;
  const mainImageSource = useMemo(() => ({ uri: displayUri ?? '' }), [displayUri]);
  const thumbImageSource = useMemo(
    () => ({ uri: showFront ? post.photo_url ?? '' : post.front_photo_url ?? '' }),
    [showFront, post.photo_url, post.front_photo_url],
  );

  const hasPhotoLayer = Boolean(displayUri);
  const isQuestionPost =
    post.type === 'task_complete' ||
    post.challenge?.type === 'task' ||
    post.challenge?.type === 'format';
  const isPhotoPost = post.type === 'photo';
  const showMedia = hasPhotoLayer || hasVideo;

  const isPollVotePost = post.type === 'poll_vote' && post.challenge;

  const lockedBody = (
    <View
      style={styles.lockedBody}
      accessibilityRole="text"
      accessibilityLabel="Complete today's challenge to see this post"
    >
      <IconLock size={32} color={colors.textSecondary} />
      <Text variant="bodySmall" color={colors.textSecondary} style={styles.lockMessage}>
        Do it and see
      </Text>
      <Text variant="micro" color={colors.textTertiary} style={styles.lockMessage}>
        {"Finish today's challenge first."}
      </Text>
    </View>
  );

  if (isPollVotePost) {
    const c = post.challenge!;
    return (
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.userInfo} accessibilityRole="text">
            <View style={styles.challengeGlyphCircle}>
              <ChallengeTypeGlyph
                type={c.type}
                title={c.title}
                pollKind={c.poll_kind}
                size={22}
                color={colors.primary}
              />
            </View>
            <View style={styles.nameContainer}>
              <Text variant="headingMedium" numberOfLines={1}>
                {challengeKindLabel(c)}
              </Text>
              <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
                {formatRelativeTime(post.daily_event?.fires_at ?? post.created_at)}
              </Text>
            </View>
          </View>
        </View>
        {blurred ? (
          lockedBody
        ) : (
          <>
            <View style={styles.pollBodyWrap}>
              <PollResultCard
                challenge={c}
                dailyEventId={post.daily_event_id!}
                variant="embedded"
                fetchEnabled
                feedAudience={feedAudience}
              />
            </View>
            <ReactionBar
              post={post}
              blurred={false}
              showTopBorder={false}
              onOpenComments={openComments}
              feedAudience={feedAudience}
            />
            <PostCommentsSheet
              visible={commentsOpen}
              postId={post.id}
              postOwnerId={post.user_id}
              commentsDisabled={post.comments_disabled}
              commentCount={post.comment_count}
              feedAudience={feedAudience}
              onClose={closeComments}
            />
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={handleProfilePress}
          style={styles.userInfo}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityHint="Opens profile"
          accessibilityLabel={
            post.profile?.username
              ? `@${post.profile.username}, ${formatRelativeTime(post.created_at)}`
              : 'Profile'
          }
        >
          <Avatar
            uri={post.profile?.avatar_url}
            username={post.profile?.username}
            size={36}
            borderColor={equippedBorder?.color}
            borderWidth={equippedBorder?.width}
          />
          <View style={styles.nameContainer}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' }}>
              <Text variant="headingMedium" numberOfLines={1}>
                @{post.profile?.username}
              </Text>
              {isOwnPost ? (
                <View style={styles.youPill}>
                  <Text variant="micro" color={colors.primary} style={{ fontWeight: '700' }}>
                    You
                  </Text>
                </View>
              ) : null}
            </View>
            <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
              {formatRelativeTime(post.created_at)}
            </Text>
          </View>
        </TouchableOpacity>
        {!isOwnPost ? (
          <TouchableOpacity
            onPress={() => setReportOpen(true)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="More options"
          >
            <IconMoreVertical size={20} color={colors.textTertiary} />
          </TouchableOpacity>
        ) : null}
      </View>

      {blurred ? (
        lockedBody
      ) : (
        <>
          {isQuestionPost && post.challenge ? (
            <PostQuestionBlock challenge={post.challenge} />
          ) : null}

          {isPhotoPost && post.challenge && showMedia ? (
            <PostPhotoPrompt title={post.challenge.title} />
          ) : null}

          {showMedia ? (
            <View style={styles.imageTap}>
              {hasPhotoLayer ? (
                <TouchableOpacity
                  onPress={handleImageToggle}
                  activeOpacity={post.front_photo_url && !hasVideo ? 0.95 : 1}
                  disabled={!post.front_photo_url || hasVideo}
                  style={{ position: 'relative' }}
                >
                  <Image
                    source={mainImageSource}
                    style={styles.media}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`${post.id}-main-${showFront ? 'front' : 'back'}`}
                  />
                  {post.front_photo_url && !hasVideo ? (
                    <View style={styles.frontThumbnailContainer}>
                      <Image
                        source={thumbImageSource}
                        style={styles.frontThumbnail}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={`${post.id}-thumb-${showFront ? 'back' : 'front'}`}
                      />
                    </View>
                  ) : null}
                </TouchableOpacity>
              ) : null}

              {hasVideo ? (
                <AppVideo
                  uri={post.video_url!}
                  style={styles.videoMedia}
                  nativeControls
                  contentFit="contain"
                  cache
                />
              ) : null}

              {post.is_late ? (
                <View style={styles.lateBadge}>
                  <Text variant="label" color={colors.warning}>
                    LATE
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          {isQuestionPost && post.caption ? <PostAnswerBlock caption={post.caption} /> : null}

          {isPhotoPost && post.caption ? (
            <View style={styles.captionPlain}>
              <Text variant="body" color={colors.text} style={{ lineHeight: 20 }}>
                {post.caption}
              </Text>
            </View>
          ) : null}

          <ReactionBar
            post={post}
            blurred={false}
            onOpenComments={openComments}
            feedAudience={feedAudience}
          />
          <PostCommentsSheet
            visible={commentsOpen}
            postId={post.id}
            postOwnerId={post.user_id}
            commentsDisabled={post.comments_disabled}
            commentCount={post.comment_count}
            feedAudience={feedAudience}
            onClose={closeComments}
          />
          {reportOpen && post.user_id ? (
            <ReportSheet
              visible={reportOpen}
              postId={post.id}
              reportedUserId={post.user_id}
              onClose={() => setReportOpen(false)}
            />
          ) : null}
        </>
      )}
    </View>
  );
}

export const PostCard = React.memo(PostCardImpl, (prev, next) => {
  if (prev.blurred !== next.blurred) return false;
  if (prev.realtimeActive !== next.realtimeActive) return false;
  if (prev.feedAudience !== next.feedAudience) return false;
  if (prev.initialCommentsOpen !== next.initialCommentsOpen) return false;
  return postsVisuallyEqual(prev.post, next.post);
});
