import React, { useMemo, useState, useCallback } from 'react';
import { View, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { CategoryBadge } from '../ui/CategoryBadge';
import { ReactionBar } from './ReactionBar';
import { IconDoc, IconLock } from '../icons/Icons';
import { Post } from '../../types/database';
import { formatRelativeTime } from '../../utils/time';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
    a.reaction_count !== b.reaction_count ||
    (a.my_reactions ?? []).join() !== (b.my_reactions ?? []).join() ||
    reactionBreakdownSig(a) !== reactionBreakdownSig(b) ||
    a.photo_url !== b.photo_url ||
    a.front_photo_url !== b.front_photo_url ||
    a.video_url !== b.video_url ||
    a.caption !== b.caption ||
    a.created_at !== b.created_at ||
    a.is_late !== b.is_late
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
  if (ac?.id !== bc?.id || ac?.title !== bc?.title || ac?.category !== bc?.category) return false;
  return true;
}

function PostCardImpl({ post, blurred }: Props) {
  const router = useRouter();
  const { colors } = useTheme();
  const [showFront, setShowFront] = useState(false);
  const hasVideo = Boolean(post.video_url && !blurred);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.background,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
          paddingBottom: 0,
          marginBottom: Spacing.sm,
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
        imageTap: {
          position: 'relative',
        },
        media: {
          width: SCREEN_WIDTH,
          aspectRatio: 1,
          backgroundColor: colors.surfaceElevated,
        },
        videoMedia: {
          width: SCREEN_WIDTH,
          aspectRatio: 16 / 9,
          backgroundColor: '#000',
        },
        blurredImage: {
          opacity: 0.55,
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
        blurOverlay: {
          ...StyleSheet.absoluteFillObject,
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          backgroundColor: 'rgba(0,0,0,0.35)',
        },
        blurText: {
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
        noImagePlaceholder: {
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceElevated,
        },
      }),
    [colors],
  );

  const handleProfilePress = useCallback(() => {
    Haptics.selectionAsync();
    if (post.profile?.username) {
      router.push(`/profile/${post.profile.username}`);
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
              <Text variant="headingMedium" color={colors.textTertiary}>
                {' · '}
                {formatRelativeTime(post.created_at)}
              </Text>
            </Text>
          </View>
        </TouchableOpacity>
        {post.challenge && (
          <CategoryBadge category={post.challenge.category} size="sm" />
        )}
      </View>

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
              style={[styles.media, blurred && styles.blurredImage]}
              contentFit="cover"
              blurRadius={blurred ? 28 : 0}
              cachePolicy="memory-disk"
              recyclingKey={`${post.id}-main-${showFront ? 'front' : 'back'}`}
            />
            {post.front_photo_url && !blurred && !hasVideo ? (
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
            style={[styles.videoMedia, blurred && styles.blurredImage]}
            useNativeControls={!blurred}
            resizeMode={ResizeMode.CONTAIN}
            shouldPlay={false}
          />
        ) : null}

        {!hasPhotoLayer && !hasVideo ? (
          <View style={[styles.media, styles.noImagePlaceholder]}>
            <IconDoc size={44} color={colors.textTertiary} />
            <Text variant="bodySmall" color={colors.textTertiary} style={{ marginTop: Spacing.sm }}>
              Text entry
            </Text>
          </View>
        ) : null}

        {blurred ? (
          <View style={styles.blurOverlay}>
            <IconLock size={32} color={colors.textSecondary} />
            <Text variant="bodySmall" color={colors.textSecondary} style={styles.blurText}>
              {"Finish today's challenge\nto unlock the feed"}
            </Text>
          </View>
        ) : null}

        {post.is_late && !blurred ? (
          <View style={styles.lateBadge}>
            <Text variant="label" color={colors.warning}>
              LATE
            </Text>
          </View>
        ) : null}
      </View>

      {post.challenge && !blurred && (
        <View style={styles.challengeRow}>
          <Text variant="bodySmall" color={colors.textSecondary}>
            {post.challenge.title}
          </Text>
        </View>
      )}

      {post.caption && !blurred && (
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
      )}

      <ReactionBar
        post={post}
        blurred={blurred}
        showTopBorder={!(post.caption && !blurred)}
      />
    </View>
  );
}

export const PostCard = React.memo(PostCardImpl, (prev, next) => {
  if (prev.blurred !== next.blurred) return false;
  return postsVisuallyEqual(prev.post, next.post);
});
