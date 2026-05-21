import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useRouter, usePathname } from 'expo-router';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { ReactionBar } from './ReactionBar';
import { PostCommentsSheet } from './PostCommentsSheet';
import { PollResultCard } from './PollResultCard';
import { ChallengeTypeGlyph } from '../challenge/ChallengeTypeGlyph';
import { challengeKindLabel } from '../../lib/challengeDisplay';
import { IconLock } from '../icons/Icons';
import { Post } from '../../types/database';
import { formatRelativeTime } from '../../utils/time';
import { hrefWithReturnTo } from '../../lib/navigationReturn';

type Props = {
  post: Post;
  blurred: boolean;
};

function reactionBreakdownSig(p: Post): string {
  return Object.entries(p.reaction_breakdown ?? {})
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([k, v]) => `${k}:${v}`)
    .join('|');
}

function postsVisuallyEqual(a: Post, b: Post): boolean {
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
    a.is_late !== b.is_late ||
    Boolean(a.is_community_poll) !== Boolean(b.is_community_poll)
  ) {
    return false;
  }
  const pa = a.profile;
  const pb = b.profile;
  if (pa?.avatar_url !== pb?.avatar_url || pa?.username !== pb?.username) {
    return false;
  }
  const ac = a.challenge;
  const bc = b.challenge;
  if (ac?.id !== bc?.id || ac?.title !== bc?.title || ac?.category !== bc?.category || ac?.type !== bc?.type)
    return false;
  return true;
}

function PostCardImpl({ post, blurred }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const [showFront, setShowFront] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const hasVideo = Boolean(post.video_url && !blurred);

  const openComments = useCallback(() => setCommentsOpen(true), []);
  const closeComments = useCallback(() => setCommentsOpen(false), []);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
          marginBottom: Spacing.lg,
          marginHorizontal: Spacing.md,
          overflow: 'hidden',
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm + 2,
        },
        userInfo: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          flex: 1,
        },
        nameContainer: {
          flex: 1,
          justifyContent: 'center',
        },
        challengeGlyphCircle: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
        },
        imageTap: {
          position: 'relative',
        },
        media: {
          width: '100%' as const,
          alignSelf: 'stretch',
          aspectRatio: 1,
          backgroundColor: colors.surfaceElevated,
        },
        videoMedia: {
          width: '100%' as const,
          alignSelf: 'stretch',
          aspectRatio: 16 / 9,
          backgroundColor: colors.mediaLetterbox,
        },
        frontThumbnailContainer: {
          position: 'absolute',
          bottom: Spacing.sm,
          right: Spacing.sm,
          borderRadius: 8,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.background,
        },
        frontThumbnail: {
          width: 72,
          height: 72,
        },
        lockMessage: {
          textAlign: 'center',
          lineHeight: 20,
        },
        lateBadge: {
          position: 'absolute',
          top: Spacing.sm,
          left: Spacing.sm,
          backgroundColor: `${colors.warning}26`,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: `${colors.warning}73`,
          paddingHorizontal: Spacing.sm,
          paddingVertical: 4,
          borderRadius: 6,
        },
        challengeRow: {
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.sm,
          paddingBottom: Spacing.xs,
        },
        captionWrapper: {
          marginHorizontal: Spacing.md,
          paddingHorizontal: Spacing.sm + 4,
          paddingVertical: Spacing.xs + 2,
          borderRadius: Radius.md,
          backgroundColor: colors.surfaceMuted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
        },
        captionAfterChallenge: {
          marginTop: Spacing.xs,
        },
        captionAfterMedia: {
          marginTop: Spacing.sm,
        },
        lockedBody: {
          width: '100%' as const,
          alignSelf: 'stretch',
          aspectRatio: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
          gap: Spacing.xs,
        },
        pollBodyWrap: {
          position: 'relative',
        },
      }),
    [colors],
  );

  const handleProfilePress = useCallback(() => {
    Haptics.selectionAsync();
    if (post.profile?.username) {
      router.push(hrefWithReturnTo(`/(app)/member/${post.profile.username}`, pathname));
    }
  }, [router, post.profile?.username]);

  const handleImageToggle = useCallback(() => {
    if (post.front_photo_url && !hasVideo) {
      Haptics.selectionAsync();
      setShowFront((v) => !v);
    }
  }, [post.front_photo_url, hasVideo]);

  const displayUri =
    showFront && post.front_photo_url ? post.front_photo_url : post.photo_url;

  const hasPhotoLayer = Boolean(displayUri);

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
                size={22}
                color={colors.primary}
              />
            </View>
            <View style={styles.nameContainer}>
              <Text variant="headingMedium" numberOfLines={1}>
                {challengeKindLabel(c)}
              </Text>
              <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
                {formatRelativeTime(post.created_at)}
              </Text>
            </View>
          </View>
        </View>
        {blurred ? (
          lockedBody
        ) : (
          <>
            <View style={styles.pollBodyWrap}>
              <PollResultCard challenge={c} variant="embedded" fetchEnabled />
            </View>
            <ReactionBar
              post={post}
              blurred={false}
              showTopBorder={false}
              onOpenComments={openComments}
            />
            <PostCommentsSheet visible={commentsOpen} postId={post.id} onClose={closeComments} />
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
          />
          <View style={styles.nameContainer}>
            <Text variant="headingMedium" numberOfLines={1}>
              @{post.profile?.username}
            </Text>
            <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
              {formatRelativeTime(post.created_at)}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {blurred ? (
        lockedBody
      ) : (
        <>
          {hasPhotoLayer || hasVideo ? (
            <View style={styles.imageTap}>
              {hasPhotoLayer ? (
                <TouchableOpacity
                  onPress={handleImageToggle}
                  activeOpacity={post.front_photo_url && !hasVideo ? 0.95 : 1}
                  disabled={!post.front_photo_url || hasVideo}
                  style={{ position: 'relative' }}
                >
                  <Image
                    source={{ uri: displayUri ?? '' }}
                    style={styles.media}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    recyclingKey={`${post.id}-main-${showFront ? 'front' : 'back'}`}
                  />
                  {post.front_photo_url && !hasVideo ? (
                    <View style={styles.frontThumbnailContainer}>
                      <Image
                        source={{
                          uri: showFront ? post.photo_url ?? '' : post.front_photo_url,
                        }}
                        style={styles.frontThumbnail}
                        contentFit="cover"
                        cachePolicy="memory-disk"
                        recyclingKey={showFront ? 'back' : 'front-thumb'}
                      />
                    </View>
                  ) : null}
                </TouchableOpacity>
              ) : null}

              {hasVideo ? (
                <Video
                  source={{ uri: post.video_url! }}
                  style={styles.videoMedia}
                  useNativeControls
                  resizeMode={ResizeMode.CONTAIN}
                  shouldPlay={false}
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

          {post.challenge ? (
            <View style={styles.challengeRow}>
              <Text variant="bodySmall" color={colors.textSecondary}>
                {post.challenge.title}
              </Text>
            </View>
          ) : null}

          {post.caption ? (
            <View
              style={[
                styles.captionWrapper,
                post.challenge ? styles.captionAfterChallenge : styles.captionAfterMedia,
              ]}
            >
              <Text variant="body" color={colors.text} style={{ lineHeight: 20 }}>
                {post.caption}
              </Text>
            </View>
          ) : null}

          <ReactionBar
            post={post}
            blurred={false}
            showTopBorder={!post.caption}
            onOpenComments={openComments}
          />
          <PostCommentsSheet visible={commentsOpen} postId={post.id} onClose={closeComments} />
        </>
      )}
    </View>
  );
}

export const PostCard = React.memo(PostCardImpl, (prev, next) => {
  if (prev.blurred !== next.blurred) return false;
  return postsVisuallyEqual(prev.post, next.post);
});
