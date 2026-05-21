import React, { useMemo, useState, useCallback, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, webScrollParentStyle } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { IconChevronLeft, IconFriends, IconChevronRight } from '../../../components/icons/Icons';
import { ProfileFriendsSheet } from '../../../components/profile/ProfileFriendsSheet';
import { ProfileStats } from '../../../components/profile/ProfileStats';
import {
  useProfile,
  useFriendship,
  useSendFriendRequest,
  useRespondToFriendRequest,
  useRemoveFriend,
  useFriendCount,
} from '../../../hooks/useProfile';
import { useAuthStore } from '../../../stores/useAuthStore';
import { getCompletionRate } from '../../../utils/time';
import { goBackWithOptionalReturn } from '../../../lib/navigationReturn';
import { formatCompactCount } from '../../../utils/formatCount';

export default function UserProfileScreen() {
  const { username, returnTo } = useLocalSearchParams<{ username: string; returnTo?: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const currentProfile = useAuthStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [friendsSheetVisible, setFriendsSheetVisible] = useState(false);

  const { data: profile, isLoading } = useProfile(username);
  const { data: friendship } = useFriendship(profile?.id);
  const { data: theirFriendCount = 0 } = useFriendCount(profile?.id);
  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondToFriendRequest();
  const removeFriend = useRemoveFriend();

  const handleBack = () => {
    goBackWithOptionalReturn(router, returnTo, '/(app)/' as Href);
  };

  useEffect(() => {
    if (currentProfile?.username === username) {
      router.replace('/(app)/profile' as Href);
    }
  }, [currentProfile?.username, username, router]);

  const onRefresh = useCallback(async () => {
    if (!profile?.id) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profile', username] }),
        queryClient.invalidateQueries({ queryKey: ['friendship', currentProfile?.id, profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['friendCount', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['profileFriends', profile.id] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [profile?.id, username, queryClient, currentProfile?.id]);

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
        friendBadge: {
          marginTop: 6,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          alignSelf: 'center',
          paddingVertical: Spacing.sm,
          paddingHorizontal: Spacing.md,
          borderRadius: Radius.sm,
          backgroundColor: colors.surfaceMuted,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
        },
      }),
    [colors],
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
            <TouchableOpacity onPress={handleBack} hitSlop={16} accessibilityRole="button">
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

  const handleUnfriend = () => {
    if (!friendship?.id || friendship.status !== 'accepted' || !profile) return;
    Alert.alert(
      'Unfriend',
      `Remove ${profile.display_name} from your friends? You can send a new request later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unfriend',
          style: 'destructive',
          onPress: () => removeFriend.mutate(friendship.id),
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <ScrollView
        style={webScrollParentStyle}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />
        }
      >
        <View style={styles.header}>
          <View style={styles.headerSide}>
            <TouchableOpacity onPress={handleBack} hitSlop={16} accessibilityRole="button">
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
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityHint="Opens friend list"
              activeOpacity={0.85}
              style={styles.friendBadge}
              onPress={() => {
                Haptics.selectionAsync();
                setFriendsSheetVisible(true);
              }}
            >
              <IconFriends size={16} color={colors.primary} />
              <Text variant="micro" color={colors.text} style={{ fontWeight: '700' }}>
                {formatCompactCount(theirFriendCount)} {theirFriendCount === 1 ? 'friend' : 'friends'}
              </Text>
              <IconChevronRight size={18} color={colors.textTertiary} />
            </TouchableOpacity>
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
            {friendship?.status === 'accepted' ? (
              <Button
                onPress={handleUnfriend}
                variant="ghost"
                size="sm"
                loading={removeFriend.isPending}
                disabled={removeFriend.isPending}
                style={{ marginTop: Spacing.sm }}
              >
                Unfriend
              </Button>
            ) : null}
          </View>
        </View>

        <ProfileStats profile={profile} completionRate={completionRate} />
      </ScrollView>
      <ProfileFriendsSheet
        visible={friendsSheetVisible}
        onClose={() => setFriendsSheetVisible(false)}
        profileUserId={profile.id}
        ownerDisplayName={profile.display_name}
      />
    </SafeAreaView>
  );
}
