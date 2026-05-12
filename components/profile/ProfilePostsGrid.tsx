import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  Pressable,
} from 'react-native';
import { Image } from 'expo-image';
import { Spacing, Radius } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconDoc } from '@/components/icons/Icons';
import type { Post } from '@/types/database';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Props = {
  posts: Post[];
  emptyHint: string;
  onPostPress: (post: Post) => void;
};

export function ProfilePostsGrid({ posts, emptyHint, onPostPress }: Props) {
  const { colors } = useTheme();

  const GRID_SIZE = useMemo(
    () => Math.floor((SCREEN_WIDTH - Spacing.lg * 2 - Spacing.xs * 2) / 3),
    [],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        sectionHeader: {
          paddingHorizontal: Spacing.lg,
          marginBottom: Spacing.sm,
        },
        grid: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: Spacing.xs,
          paddingHorizontal: Spacing.lg,
        },
        tile: {
          width: GRID_SIZE,
          height: GRID_SIZE,
          borderRadius: Radius.sm,
          overflow: 'hidden',
          backgroundColor: colors.surfaceRaised,
        },
        image: {
          width: '100%',
          height: '100%',
        },
        placeholder: {
          alignItems: 'center',
          justifyContent: 'center',
        },
        empty: {
          paddingVertical: Spacing.xl,
          paddingHorizontal: Spacing.lg,
          alignItems: 'center',
        },
      }),
    [colors.surfaceRaised, GRID_SIZE],
  );

  return (
    <View style={{ marginBottom: Spacing.xl }}>
      <View style={styles.sectionHeader}>
        <Text variant="headingMedium">Posts</Text>
      </View>
      {posts.length === 0 ? (
        <View style={styles.empty}>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {emptyHint}
          </Text>
        </View>
      ) : (
        <View style={styles.grid}>
          {posts.map((post) => (
            <Pressable
              key={post.id}
              accessibilityRole="button"
              accessibilityLabel="Open post"
              onPress={() => onPostPress(post)}
              style={({ pressed }) => [styles.tile, pressed && { opacity: 0.88 }]}
            >
              {post.photo_url ? (
                <Image
                  source={{ uri: post.photo_url }}
                  style={styles.image}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
              ) : (
                <View style={[styles.image, styles.placeholder]}>
                  <IconDoc size={28} color={colors.textTertiary} />
                </View>
              )}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
