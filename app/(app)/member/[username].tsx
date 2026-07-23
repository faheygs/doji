import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Button } from '@/components/ui/Button';
import { XPBar } from '@/components/gamification/XPBar';
import { BadgesGrid } from '@/components/gamification/BadgesGrid';
import {
  ProfileHeroRow,
  ProfileStatsStrip,
  ProfileStreakPair,
} from '@/components/profile/ProfileSections';
import {
  IconChevronLeft,
  IconCheck,
  IconPlus,
} from '@/components/icons/Icons';
import { ProfileFriendsSheet } from '@/components/profile/ProfileFriendsSheet';
import {
  useProfile,
  useFriendship,
  useFriendshipStatus,
  useSendFriendRequest,
  useRespondToFriendRequest,
  useRemoveFriend,
  useFriendCount,
} from '@/hooks/useProfile';
import { useBlockUser, useUnblockUser, useIsBlockedByMe } from '@/hooks/useBlockUser';
import { ReportSheet } from '@/components/feed/ReportSheet';
import { useAuthStore } from '@/stores/useAuthStore';
import { safeReplace, FEED_TAB_HREF } from '@/lib/navigationReturn';
import { sanitizeReturnTo } from '@/lib/navigationReturn';
import { normalizeUsernameInput } from '@/hooks/useUsernameAvailability';
import {
  useBadgeCategories,
  useBadgeTiers,
  useUserBadgeProgress,
} from '@/hooks/useBadges';
import type { BadgeProgressStats } from '@/lib/badgeProgress';
import { countEarnedBadgeTiers } from '@/lib/badgeProgress';

export default function UserProfileScreen() {
  const params = useLocalSearchParams<{ username: string | string[]; returnTo?: string }>();
  const username = useMemo(() => {
    const raw = params.username;
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value ? normalizeUsernameInput(value) : undefined;
  }, [params.username]);
  const { returnTo } = params;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const currentProfile = useAuthStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [friendsSheetVisible, setFriendsSheetVisible] = useState(false);
  const [reportUserOpen, setReportUserOpen] = useState(false);

  const openFriendsList = useCallback(() => {
    Haptics.selectionAsync();
    setFriendsSheetVisible(true);
  }, []);

  const { data: profile, isLoading } = useProfile(username);
  const { data: friendship } = useFriendship(profile?.id);
  const { data: friendshipStatus = 'none' } = useFriendshipStatus(profile?.id);
  const { data: friendCount = 0 } = useFriendCount(profile?.id);
  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondToFriendRequest();
  const removeFriend = useRemoveFriend();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const { data: isBlockedByMe = false } = useIsBlockedByMe(profile?.id);
  const { data: categories = [] } = useBadgeCategories();
  const { data: tiers = [] } = useBadgeTiers();
  const { data: badgeProgress = [] } = useUserBadgeProgress(profile?.id);

  const badgeProgressStats = useMemo((): BadgeProgressStats | null => {
    if (!profile) return null;
    return {
      currentStreak: profile.current_streak ?? 0,
      longestStreak: profile.longest_streak ?? 0,
      totalCompletions: profile.total_completions ?? 0,
      xp: profile.xp ?? 0,
      level: profile.level ?? 0,
      reactionsReceived: profile.reactions_received ?? 0,
      reactionsGiven: 0,
      pollVotes: 0,
      friendsCount: friendCount,
      challengeIdeasSubmitted: 0,
      challengeIdeasPicked: 0,
    };
  }, [profile, friendCount]);

  const badgeEarnedSummary = useMemo(
    () => countEarnedBadgeTiers(tiers, badgeProgress, badgeProgressStats),
    [tiers, badgeProgress, badgeProgressStats],
  );

  const handleBack = () => {
    // member/[username] is a Tabs.Screen, so its history accumulates across visits.
    // router.back() would navigate within the member tab's stack (e.g. back to a
    // previously visited profile). Always replace to the explicit returnTo or feed
    // so the destination is always correct regardless of tab stack state.
    const target = sanitizeReturnTo(returnTo);
    safeReplace(router, target ?? FEED_TAB_HREF);
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
        queryClient.invalidateQueries({ queryKey: ['friends', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['userBadgeProgress', profile.id] }),
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
        topBar: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xs,
          paddingBottom: Spacing.sm,
          gap: Spacing.sm,
        },
        topBarActions: {
          flex: 1,
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: Spacing.xs,
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        friendActionButton: {
          minWidth: 0,
        },
        section: { paddingHorizontal: Spacing.md, marginTop: Spacing.lg },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: Spacing.md,
        },
      }),
    [colors],
  );

  if (currentProfile?.username === username) {
    return null;
  }

  const headerBack = (
    <TouchableOpacity
      onPress={handleBack}
      hitSlop={16}
      accessibilityRole="button"
      accessibilityLabel="Back"
      onPressIn={() => Haptics.selectionAsync()}
    >
      <IconChevronLeft size={26} color={colors.textSecondary} />
    </TouchableOpacity>
  );

  if (isLoading && !profile) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.topBar}>
          {headerBack}
          <View style={{ flex: 1 }} />
        </View>
        <View style={styles.centered}>
          <Text variant="body" color={colors.textSecondary}>
            Loading profile…
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!profile) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.topBar}>
          {headerBack}
          <View style={{ flex: 1 }} />
        </View>
        <View style={styles.centered}>
          <Text variant="body" color={colors.textSecondary}>
            User not found
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isFriend = friendshipStatus === 'friends';
  const pendingIncoming = friendshipStatus === 'pending_in';
  const pendingOutgoing = friendshipStatus === 'pending_out';

  const handleFriendAction = () => {
    if (isFriend) return;
    if (pendingIncoming && friendship?.id) {
      respondRequest.mutate({ friendshipId: friendship.id, accept: true });
      return;
    }
    if (friendshipStatus === 'none' && profile) {
      sendRequest.mutate(profile.id);
    }
  };

  const friendDisabled =
    pendingOutgoing ||
    sendRequest.isPending ||
    respondRequest.isPending ||
    friendshipStatus === 'blocked';

  const handleRemoveFriend = () => {
    if (!profile || !friendship?.id) return;
    Alert.alert('Remove friend', `Remove ${profile.display_name} from your friends?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeFriend.mutate(friendship.id),
      },
    ]);
  };

  const handleBlockUser = () => {
    if (!profile) return;
    Alert.alert(
      'Block user',
      `Block ${profile.display_name}? Their content will be removed from your feed immediately. This also notifies our moderation team.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () =>
            blockUser.mutate(
              { blockedUserId: profile.id, friendshipId: friendship?.id },
              { onSuccess: handleBack },
            ),
        },
      ],
    );
  };

  const handleUnblockUser = () => {
    if (!profile) return;
    Alert.alert(
      'Unblock user',
      `Unblock ${profile.display_name}? They'll be able to see your posts and interact with you again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          style: 'destructive',
          onPress: () =>
            unblockUser.mutate(profile.id, {
              onSuccess: () => Toast.show({ type: 'success', text1: `${profile.display_name} unblocked` }),
            }),
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
        <View style={styles.topBar}>
          {headerBack}
          <View style={styles.topBarActions}>
            {isBlockedByMe ? (
              <Button
                onPress={handleUnblockUser}
                variant="secondary"
                size="sm"
                loading={unblockUser.isPending}
                disabled={unblockUser.isPending}
                style={styles.friendActionButton}
              >
                Unblock
              </Button>
            ) : (
              <>
                {isFriend ? (
                  <Button
                    onPress={handleRemoveFriend}
                    variant="secondary"
                    size="sm"
                    loading={removeFriend.isPending}
                    disabled={removeFriend.isPending}
                    leftIcon={<IconCheck size={15} color={colors.textSecondary} />}
                    style={styles.friendActionButton}
                  >
                    Friends
                  </Button>
                ) : pendingOutgoing ? (
                  <Button
                    onPress={() => {}}
                    variant="secondary"
                    size="sm"
                    disabled
                    style={styles.friendActionButton}
                  >
                    Requested
                  </Button>
                ) : friendshipStatus === 'blocked' ? (
                  <Button
                    onPress={() => {}}
                    variant="secondary"
                    size="sm"
                    disabled
                    style={styles.friendActionButton}
                  >
                    Unavailable
                  </Button>
                ) : (
                  <Button
                    onPress={handleFriendAction}
                    variant="primary"
                    size="sm"
                    loading={sendRequest.isPending || respondRequest.isPending}
                    disabled={friendDisabled}
                    leftIcon={
                      pendingIncoming ? (
                        <IconCheck size={14} color={colors.onPrimary} />
                      ) : (
                        <IconPlus size={14} color={colors.onPrimary} />
                      )
                    }
                    style={styles.friendActionButton}
                  >
                    {pendingIncoming ? 'Accept' : 'Add friend'}
                  </Button>
                )}
                <Button
                  onPress={handleBlockUser}
                  variant="secondary"
                  size="sm"
                  loading={blockUser.isPending}
                  disabled={blockUser.isPending}
                  style={styles.friendActionButton}
                >
                  Block
                </Button>
                <Button
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setReportUserOpen(true);
                  }}
                  variant="secondary"
                  size="sm"
                  style={styles.friendActionButton}
                >
                  Report
                </Button>
              </>
            )}
          </View>
        </View>

        <ProfileHeroRow profile={profile} showLevel />

        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
          <XPBar xp={profile.xp ?? 0} level={profile.level ?? 1} />
        </View>

        <ProfileStatsStrip
          friendCount={friendCount}
          responses={profile.total_completions ?? 0}
          reactions={profile.reactions_received ?? 0}
          style={{ marginTop: Spacing.lg }}
          onPressFriends={openFriendsList}
        />

        <ProfileStreakPair
          currentStreak={profile.current_streak ?? 0}
          bestStreak={profile.longest_streak ?? 0}
          style={{ marginTop: Spacing.md }}
        />

        {categories.length > 0 ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="headingMedium">Badges</Text>
              <Text variant="caption" color={colors.textTertiary}>
                {badgeEarnedSummary.earned}/{badgeEarnedSummary.total}
              </Text>
            </View>
            <BadgesGrid
              readOnly
              categories={categories}
              tiers={tiers}
              progress={badgeProgress}
              progressStats={badgeProgressStats}
            />
          </View>
        ) : null}
      </ScrollView>
      {friendsSheetVisible ? (
        <ProfileFriendsSheet
          visible
          onClose={() => setFriendsSheetVisible(false)}
          profileUserId={profile.id}
          ownerDisplayName={profile.display_name}
        />
      ) : null}

      {reportUserOpen ? (
        <ReportSheet
          visible
          reportedUserId={profile.id}
          onClose={() => setReportUserOpen(false)}
        />
      ) : null}
    </SafeAreaView>
  );
}
