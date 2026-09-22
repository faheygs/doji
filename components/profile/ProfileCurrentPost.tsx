import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Radius, Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useNavigationOrigin } from '../../contexts/NavigationOriginContext';
import { usePostMedia } from '../../hooks/usePostMedia';
import { postMediaCacheKey } from '../../lib/postMedia';
import { postDetailHref } from '../../lib/routes';
import type { Post } from '../../types/database';
import { IconChevronRight } from '../icons/Icons';
import { Skeleton } from '../ui/Skeleton';
import { Text } from '../ui/Text';

type Props = {
  post: Post | null | undefined;
  loading?: boolean;
};

export function ProfileCurrentPost({ post, loading = false }: Props) {
  const router = useRouter();
  const navigationOrigin = useNavigationOrigin();
  const { colors } = useTheme();
  const [imageReady, setImageReady] = useState(false);
  const media = usePostMedia(post ?? EMPTY_POST, Boolean(post), 'thumbnail');
  const reference = post?.photo_url ?? post?.front_photo_url ?? null;
  const uri = media.photo_url ?? media.front_photo_url;

  useEffect(() => setImageReady(false), [reference]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        section: { paddingHorizontal: Spacing.md, marginTop: Spacing.lg, gap: Spacing.sm },
        card: {
          overflow: 'hidden',
          borderRadius: Radius.lg,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
          backgroundColor: colors.surface,
        },
        media: { width: '100%', aspectRatio: 1 },
        fill: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
        body: { minHeight: 132, padding: Spacing.lg, justifyContent: 'center', gap: Spacing.xs },
        footer: {
          minHeight: 48,
          paddingHorizontal: Spacing.md,
          flexDirection: 'row',
          alignItems: 'center',
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.hairline,
        },
      }),
    [colors],
  );

  if (loading && !post) {
    return (
      <View style={styles.section}>
        <Text variant="headingMedium">Today&apos;s Doji</Text>
        <View style={[styles.media, { borderRadius: Radius.lg, overflow: 'hidden' }]}>
          <Skeleton height="100%" radius={Radius.lg} />
        </View>
      </View>
    );
  }
  if (!post) return null;

  const openPost = () => {
    Haptics.selectionAsync();
    router.push(postDetailHref(post.id, { returnTo: navigationOrigin }));
  };

  return (
    <View style={styles.section}>
      <Text variant="headingMedium">Today&apos;s Doji</Text>
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.9}
        onPress={openPost}
        accessibilityRole="button"
        accessibilityLabel="Open today's Doji post"
      >
        {reference ? (
          <View style={styles.media}>
            {!imageReady ? <Skeleton height="100%" style={styles.fill} /> : null}
            {uri ? (
              <Image
                source={{ uri, cacheKey: postMediaCacheKey(reference, 'thumbnail') }}
                style={styles.fill}
                contentFit="cover"
                transition={0}
                onLoad={() => setImageReady(true)}
              />
            ) : null}
          </View>
        ) : (
          <View style={styles.body}>
            <Text variant="bodySmall" color={colors.textTertiary}>
              {post.challenge?.title ?? 'Daily Doji'}
            </Text>
            <Text variant="headingMedium" numberOfLines={4}>
              {post.caption?.trim() || 'View this response'}
            </Text>
          </View>
        )}
        <View style={styles.footer}>
          <Text variant="bodySmall" style={{ flex: 1, fontWeight: '700' }}>
            View post, reactions, and comments
          </Text>
          <IconChevronRight size={20} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    </View>
  );
}

const EMPTY_POST = {
  id: '', photo_url: null, front_photo_url: null, video_url: null,
} as Post;
