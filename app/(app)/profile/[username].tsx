import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Spacing, webScrollParentStyle } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { IconChevronLeft } from '../../../components/icons/Icons';
import { ProfileStats } from '../../../components/profile/ProfileStats';
import { ProfilePostsGrid } from '../../../components/profile/ProfilePostsGrid';
import {
  useProfile,
  useProfilePosts,
  useFriendship,
  useSendFriendRequest,
  useRespondToFriendRequest,
} from '../../../hooks/useProfile';
import { useAuthStore } from '../../../stores/useAuthStore';
import { getCompletionRate } from '../../../utils/time';
import type { Post } from '../../../types/database';

export default function UserProfileScreen() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const currentProfile = useAuthStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);

  const { data: profile, isLoading } = useProfile(username);
  const { data: posts = [] } = useProfilePosts(profile?.id);
  const { data: friendship } = useFriendship(profile?.id);
  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondToFriendRequest();

  useEffect(() => {
    if (currentProfile?.username === username) {
      router.replace('/(app)/profile');
    }
  }, [currentProfile?.username, username, router]);

  const onRefresh = useCallback(async () => {
    if (!profile?.id) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile', username] }),
        queryClient.invalidateQueries({ queryKey: ['profilePosts', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['friendship', currentProfile?.id, profile.id] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [
    profile?.id,
    username,
    queryClient,
    currentProfile?.id,
  ]);

  const openPost = useCallback(
    (post: Post) => {
      Haptics.selectionAsync();
      router.push(`/(app)/post/${post.id}` as Href);
    },
    [router],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        scrollContent: {
          paddingBottom: Spacing.xxl,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm,
        },
        headerSide: {
          width: 44,
          alignItems: 'flex-start',
        },
        headerTitle: {
          flex: 1,
          alignItems: 'center',
        },
        hero: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          paddingHorizontal: Spacing.lg,
          paddingBottom: Spacing.lg,
          gap: Spacing.md,
        },
        profileInfo: {
          flex: 1,
          minWidth: 0,
          gap: 4,
        },
        bio: {
          marginTop: Spacing.xs,
        },
        friendButton: {
          marginTop: Spacing.md,
          alignSelf: 'stretch',
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors.background],
  );

  if (currentProfile?.username === username) {
    return null;
  }

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={16} accessibilityRole="button">
              <IconChevronLeft size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.centered}>
          <Text variant="body" color={colors.textSecondary}>
            User not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const completionRate = getCompletionRate(
    profile.total_completions,
    profile.total_completions + profile.total_missed,
  );

  const pendingIncoming =
    friendship?.status === 'pending' && friendship.addressee_id === currentProfile?.id;
  const pendingOutgoing =
    friendship?.status === 'pending' && friendship.requester_id === currentProfile?.id;

  const getFriendButtonLabel = () => {
    if (!friendship) return 'Add friend';
    if (friendship.status === 'accepted') return 'Friends';
    if (pendingOutgoing) return 'Request sent';
    if (pendingIncoming) return 'Accept request';
    return 'Add friend';
  };

  const handleFriendAction = () => {
    if (friendship?.status === 'accepted') return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (pendingIncoming && friendship?.id) {
      respondRequest.mutate({ friendshipId: friendship.id, accept: true });
      return;
    }
    if (!friendship || friendship.status !== 'pending') {
      sendRequest.mutate(profile.id);
    }
  };

  const friendDisabled =
    friendship?.status === 'accepted' ||
    pendingOutgoing ||
    sendRequest.isPending ||
    respondRequest.isPending;

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <ScrollView
        style={webScrollParentStyle}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={() => router.back()} hitSlop={16} accessibilityRole="button">
              <IconChevronLeft size={24} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.headerTitle}>
            <Text variant="headingMedium" numberOfLines={1}>
              {profile.display_name}
            </Text>
            <Text variant="label" color={colors.textTertiary} numberOfLines={1}>
              @{profile.username}
            </Text>
          </View>
          <View style={styles.headerSide} />
        </View>

        <View style={styles.hero}>
          <Avatar uri={profile.avatar_url} username={profile.username} size={88} />
          <View style={styles.profileInfo}>
            {profile.bio ? (
              <Text variant="body" color={colors.textSecondary} style={styles.bio}>
                {profile.bio}
              </Text>
            ) : null}
            <Button
              onPress={handleFriendAction}
              variant={friendship?.status === 'accepted' ? 'secondary' : 'primary'}
              size="sm"
              loading={sendRequest.isPending || respondRequest.isPending}
              disabled={friendDisabled}
              style={styles.friendButton}
            >
              {getFriendButtonLabel()}
            </Button>
          </View>
        </View>

        <ProfileStats profile={profile} completionRate={completionRate} />

        <ProfilePostsGrid
          posts={posts}
          emptyHint="No posts yet."
          onPostPress={openPost}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
