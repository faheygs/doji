import React, { useMemo, useCallback, useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Spacing, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { ProfileSkeleton } from '@/components/ui/LoadingSkeletons';
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
import { invalidateQueryRoots } from '@/lib/queryInvalidationBatcher';
import { countEarnedBadgeTiers } from '@/lib/badgeProgress';
import { ProfileManageMenu } from '@/components/profile/ProfileManageMenu';
import { useAppDialog } from '@/contexts/DialogContext';

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
  const { showDialog } = useAppDialog();
  const currentProfile = useAuthStore((s) => s.profile);
  const [refreshing, setRefreshing] = useState(false);
  const [friendsSheetVisible, setFriendsSheetVisible] = useState(false);
  const [reportUserOpen, setReportUserOpen] = useState(false);

  const openFriendsList = useCallback(() => {
    Haptics.selectionAsync();
    setFriendsSheetVisible(true);
  }, []);

  const { data: profile, blockedByUser, isLoading } = useProfile(username);
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
      await invalidateQueryRoots(queryClient, [
        'profile', 'friendship', 'friendCount', 'friends', 'userBadgeProgress',
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
          paddingBottom: Spacing.lg,
          gap: Spacing.sm,
        },
        topBarSpacer: { flex: 1 },
        topActions: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        headerFriendButton: {
          minHeight: 44,
          paddingHorizontal: Spacing.md,
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
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
        <ProfileSkeleton />
      </SafeAreaView>
    );
  }

  if (blockedByUser || !profile) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.topBar}>
          {headerBack}
          <View style={{ flex: 1 }} />
        </View>
        <View style={styles.centered}>
          <Text variant="headingMedium">
            {blockedByUser ? 'This user has blocked you' : 'User not found'}
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
      sendRequest.mutate({ addresseeId: profile.id });
    }
  };

  const friendDisabled =
    pendingOutgoing ||
    sendRequest.isPending ||
    respondRequest.isPending ||
    friendshipStatus === 'blocked';

  const handleRemoveFriend = () => {
    if (!profile || !friendship?.id) return;
    showDialog({
      title: 'Unfriend?',
      message: `Remove ${profile.display_name} from your friends?`,
      actions: [
        { label: 'Cancel', variant: 'cancel' },
      {
        label: 'Unfriend',
        variant: 'destructive',
        onPress: () => removeFriend.mutate({ friendshipId: friendship.id }),
      },
      ],
    });
  };

  const handleBlockUser = () => {
    if (!profile) return;
    showDialog({
      title: 'Block user?',
      message: `Block ${profile.display_name}? Their content will leave your feed immediately and our moderation team will be notified.`,
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Block',
          variant: 'destructive',
          onPress: () =>
            blockUser.mutate(
              { blockedUserId: profile.id, friendshipId: friendship?.id },
              { onSuccess: handleBack },
            ),
        },
      ],
    });
  };

  const handleUnblockUser = () => {
    if (!profile) return;
    showDialog({
      title: 'Unblock user?',
      message: `Unblock ${profile.display_name}? They'll be able to see your posts and interact with you again.`,
      actions: [
        { label: 'Cancel', variant: 'cancel' },
        {
          label: 'Unblock',
          onPress: () =>
            unblockUser.mutate({ blockedUserId: profile.id }, {
              onSuccess: () => Toast.show({ type: 'success', text1: `${profile.display_name} unblocked` }),
            }),
        },
      ],
    });
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
          <View style={styles.topBarSpacer} />
          <View style={styles.topActions}>
            {!isBlockedByMe ? (
              <Button
                onPress={isFriend ? handleRemoveFriend : handleFriendAction}
                variant={isFriend || pendingOutgoing ? 'secondary' : 'primary'}
                size="sm"
                loading={
                  sendRequest.isPending || respondRequest.isPending || removeFriend.isPending
                }
                disabled={removeFriend.isPending || (!isFriend && friendDisabled)}
                leftIcon={
                  !isFriend && !pendingOutgoing ? (
                    <IconPlus size={15} color={colors.onPrimary} />
                  ) : undefined
                }
                style={styles.headerFriendButton}
              >
                {isFriend
                  ? 'Unfriend'
                  : pendingOutgoing
                    ? 'Sent'
                    : pendingIncoming
                      ? 'Accept'
                      : 'Add friend'}
              </Button>
            ) : null}
            <ProfileManageMenu
              isBlocked={isBlockedByMe}
              busy={removeFriend.isPending || blockUser.isPending || unblockUser.isPending}
              onBlock={handleBlockUser}
              onUnblock={handleUnblockUser}
              onReport={() => setReportUserOpen(true)}
            />
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
