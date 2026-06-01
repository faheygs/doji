import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Spacing, webScrollParentStyle } from '../../../../constants/theme';
import { useTheme } from '../../../../contexts/ThemeContext';
import { Text } from '../../../../components/ui/Text';
import { PostCard } from '../../../../components/feed/PostCard';
import { IconChevronLeft } from '../../../../components/icons/Icons';
import { usePost } from '../../../../hooks/useProfile';
import { useUserEvent } from '../../../../hooks/useUserEvent';
import { hasUnlockedFeed } from '../../../../lib/participationGate';

export default function PostDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useTheme();
  const { data: post, isLoading, error } = usePost(id);
  const { data: userEvent, isLoading: userEventLoading } = useUserEvent();
  const feedLocked = !hasUnlockedFeed(userEvent) && !userEventLoading;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        backHit: { padding: Spacing.xs },
        centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl },
        scroll: { flex: 1 },
        scrollContent: { paddingBottom: Spacing.xxl },
      }),
    [colors.background, colors.hairline],
  );

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={16}
          style={styles.backHit}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text variant="headingMedium" numberOfLines={1} style={{ flex: 1 }}>
          Post
        </Text>
      </View>
      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : error || !post ? (
        <View style={styles.centered}>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            {"Couldn't load this post. It may have been removed."}
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
          <PostCard post={post} blurred={feedLocked} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
