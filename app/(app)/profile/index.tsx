import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Spacing, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { IconSettings } from '@/components/icons/Icons';
import { XPBar } from '@/components/gamification/XPBar';
import { BadgesGrid } from '@/components/gamification/BadgesGrid';
import {
  ProfileHeroRow,
  ProfileStatsStrip,
  ProfileStreakPair,
} from '@/components/profile/ProfileSections';
import { ProfileFriendsSheet } from '@/components/profile/ProfileFriendsSheet';
import { SubmissionCard } from '@/components/profile/SubmissionCard';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBadgeCategories, useBadgeTiers, useUserBadgeProgress } from '@/hooks/useBadges';
import { useMySuggestions } from '@/hooks/useSuggestions';
import { useFriendCount } from '@/hooks/useProfile';
import { useReactionsGivenCount } from '@/hooks/useReactionsGivenCount';
import { usePollVotesCount } from '@/hooks/usePollVotesCount';
import { useChangeProfilePhoto } from '@/hooks/useChangeProfilePhoto';
import { useSparksBalance } from '@/hooks/useSparks';
import { hrefWithReturnTo } from '@/lib/navigationReturn';
import type { BadgeProgressStats } from '@/lib/badgeProgress';
import { countEarnedBadgeTiers } from '@/lib/badgeProgress';
import type { Profile } from '@/types/database';

export default function MyProfileScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile) as Profile | null;
  const sparks = useSparksBalance();
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const { openChangePhotoDialog, uploading } = useChangeProfilePhoto();
  const { data: categories = [] } = useBadgeCategories();
  const { data: tiers = [] } = useBadgeTiers();
  const { data: badgeProgress = [] } = useUserBadgeProgress(profile?.id);
  const { data: friendCount = 0 } = useFriendCount(profile?.id);
  const { data: reactionsGiven = 0 } = useReactionsGivenCount(profile?.id);
  const { data: pollVotes = 0 } = usePollVotesCount(profile?.id);
  const { data: mySuggestions = [] } = useMySuggestions(profile?.id);
  const [refreshing, setRefreshing] = useState(false);
  const [friendsSheetVisible, setFriendsSheetVisible] = useState(false);

  const openFriendsList = useCallback(() => {
    Haptics.selectionAsync();
    setFriendsSheetVisible(true);
  }, []);

  const badgeProgressStats = useMemo((): BadgeProgressStats | null => {
    if (!profile) return null;
    return {
      currentStreak: profile.current_streak ?? 0,
      longestStreak: profile.longest_streak ?? 0,
      totalCompletions: profile.total_completions ?? 0,
      xp: profile.xp ?? 0,
      level: profile.level ?? 0,
      reactionsReceived: profile.reactions_received ?? 0,
      reactionsGiven,
      pollVotes,
      friendsCount: friendCount,
      challengeIdeasSubmitted: mySuggestions.length,
      challengeIdeasPicked: mySuggestions.filter((s) => s.status === 'approved').length,
    };
  }, [profile, friendCount, reactionsGiven, pollVotes, mySuggestions]);

  const badgeEarnedSummary = useMemo(
    () => countEarnedBadgeTiers(tiers, badgeProgress, badgeProgressStats),
    [tiers, badgeProgress, badgeProgressStats],
  );

  const onRefresh = useCallback(async () => {
    if (!profile?.id) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['userBadgeProgress', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['friendCount', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['friends', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['profileFriends', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['mySuggestions', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['reactionsGiven', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        fetchProfile(profile.id),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [profile?.id, queryClient, fetchProfile]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: Spacing.xxl },
        topBar: {
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xs,
          paddingBottom: Spacing.xs,
        },
        heroRow: {
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: Spacing.md,
          paddingHorizontal: Spacing.lg,
        },
        section: { paddingHorizontal: Spacing.md, marginTop: Spacing.lg },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: Spacing.md,
        },
        submissionsList: {
          gap: Spacing.sm,
        },
      }),
    [colors],
  );

  if (!profile) return null;

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
        <View style={styles.topBar}>
          <TouchableOpacity
            onPress={() => router.push(hrefWithReturnTo('/(app)/profile/settings', pathname))}
            hitSlop={16}
            accessibilityLabel="Settings"
            onPressIn={() => Haptics.selectionAsync()}
          >
            <IconSettings size={26} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <ProfileHeroRow
          profile={profile}
          onChangePhoto={openChangePhotoDialog}
          photoUploading={uploading}
        />

        <View style={{ paddingHorizontal: Spacing.lg, marginTop: Spacing.lg }}>
          <XPBar xp={profile.xp ?? 0} level={profile.level ?? 1} />
        </View>

        <ProfileStatsStrip
          friendCount={friendCount}
          responses={profile.total_completions ?? 0}
          reactions={reactionsGiven}
          style={{ marginTop: Spacing.lg }}
          onPressFriends={openFriendsList}
        />

        <ProfileStreakPair
          currentStreak={profile.current_streak ?? 0}
          bestStreak={profile.longest_streak ?? 0}
          sparks={sparks}
          onPressShop={() => {
            Haptics.selectionAsync();
            router.push(hrefWithReturnTo('/(app)/profile/shop', pathname));
          }}
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
              categories={categories}
              tiers={tiers}
              progress={badgeProgress}
              progressStats={badgeProgressStats}
            />
          </View>
        ) : null}

        {mySuggestions.length > 0 ? (
          <View style={styles.section}>
            <Text variant="headingMedium" style={{ marginBottom: Spacing.md }}>
              My Submissions
            </Text>
            <View style={styles.submissionsList}>
              {mySuggestions.map((s) => (
                <SubmissionCard key={s.id} submission={s} />
              ))}
            </View>
          </View>
        ) : null}
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
