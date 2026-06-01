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
import { PrivateProfileGate } from '@/components/profile/PrivateProfileGate';
import {
  IconChevronLeft,
  IconCheck,
  IconPlus,
} from '@/components/icons/Icons';
import { ProfileFriendsSheet, type FollowListTab } from '@/components/profile/ProfileFriendsSheet';
import { useProfile } from '@/hooks/useProfile';
import {
  useFollowRelation,
  useFollow,
  useUnfollow,
  useRespondToFollowRequest,
  useFollowerCount,
  useFollowingCount,
} from '@/hooks/useFollows';
import { useAuthStore } from '@/stores/useAuthStore';
import { goBackWithOptionalReturn, FEED_TAB_HREF } from '@/lib/navigationReturn';
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
  const [friendsSheetTab, setFriendsSheetTab] = useState<FollowListTab>('following');

  const openFollowList = useCallback((tab: FollowListTab) => {
    Haptics.selectionAsync();
    setFriendsSheetTab(tab);
    setFriendsSheetVisible(true);
  }, []);

  const { data: profile, isLoading } = useProfile(username);
  const { data: followRelation } = useFollowRelation(profile?.id);
  const followStatus = followRelation?.status ?? 'none';
  const { data: followerCount = 0 } = useFollowerCount(profile?.id);
  const { data: followingCount = 0 } = useFollowingCount(profile?.id);
  const follow = useFollow();
  const unfollow = useUnfollow();
  const respondRequest = useRespondToFollowRequest();
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
      friendsCount: followerCount,
      challengeIdeasSubmitted: 0,
      challengeIdeasPicked: 0,
    };
  }, [profile, followerCount]);

  const badgeEarnedSummary = useMemo(
    () => countEarnedBadgeTiers(tiers, badgeProgress, badgeProgressStats),
    [tiers, badgeProgress, badgeProgressStats],
  );

  const handleBack = () => {
    goBackWithOptionalReturn(router, returnTo, FEED_TAB_HREF);
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
        queryClient.invalidateQueries({ queryKey: ['followRelation', currentProfile?.id, profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['followStatus', currentProfile?.id, profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['followerCount', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['followingCount', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['following', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['followers', profile.id] }),
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

  const isPrivate = profile.is_private === true;
  const canViewContent = !isPrivate || followStatus === 'following';
  const pendingIncoming = followStatus === 'pending_in';
  const pendingOutgoing = followStatus === 'pending_out';
  const isFollowing = followStatus === 'following';

  const handleFollowAction = () => {
    if (isFollowing) return;
    if (pendingIncoming && followRelation?.incoming?.id) {
      respondRequest.mutate({ followId: followRelation.incoming.id, accept: true });
      return;
    }
    if (followStatus === 'none') {
      follow.mutate(profile.id);
    }
  };

  const followDisabled =
    pendingOutgoing || follow.isPending || respondRequest.isPending || followStatus === 'blocked';

  const handleUnfollow = () => {
    if (!profile) return;
    Alert.alert('Unfollow', `Stop following ${profile.display_name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Unfollow',
        style: 'destructive',
        onPress: () => unfollow.mutate(profile.id),
      },
    ]);
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
            {isFollowing ? (
              <Button
                onPress={handleUnfollow}
                variant="secondary"
                size="sm"
                loading={unfollow.isPending}
                disabled={unfollow.isPending}
                leftIcon={<IconCheck size={15} color={colors.textSecondary} />}
                style={styles.friendActionButton}
              >
                Following
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
            ) : followStatus === 'blocked' ? (
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
                onPress={handleFollowAction}
                variant="primary"
                size="sm"
                loading={follow.isPending || respondRequest.isPending}
                disabled={followDisabled}
                leftIcon={
                  pendingIncoming ? (
                    <IconCheck size={14} color={colors.onPrimary} />
                  ) : (
                    <IconPlus size={14} color={colors.onPrimary} />
                  )
                }
                style={styles.friendActionButton}
              >
                {pendingIncoming ? 'Accept' : 'Follow'}
              </Button>
            )}
          </View>
        </View>

        <ProfileHeroRow profile={profile} showLevel={canViewContent} />

        {canViewContent ? (
          <>
            <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
              <XPBar xp={profile.xp ?? 0} level={profile.level ?? 1} />
            </View>

            <ProfileStatsStrip
              followers={followerCount}
              following={followingCount}
              responses={profile.total_completions ?? 0}
              reactions={profile.reactions_received ?? 0}
              style={{ marginTop: Spacing.lg }}
              onPressFollowers={() => openFollowList('followers')}
              onPressFollowing={() => openFollowList('following')}
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
          </>
        ) : (
          <PrivateProfileGate followStatus={followStatus} />
        )}
      </ScrollView>
      {canViewContent && (
        <ProfileFriendsSheet
          visible={friendsSheetVisible}
          onClose={() => setFriendsSheetVisible(false)}
          profileUserId={profile.id}
          ownerDisplayName={profile.display_name}
          initialTab={friendsSheetTab}
        />
      )}
    </SafeAreaView>
  );
}
