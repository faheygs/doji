import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, usePathname } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, Shadows, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { IconCamera, IconSettings, IconReactionFire } from '@/components/icons/Icons';
import { XPBar } from '@/components/gamification/XPBar';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { RankBadge } from '@/components/gamification/RankBadge';
import { BadgesGrid } from '@/components/gamification/BadgesGrid';
import { useAuthStore } from '@/stores/useAuthStore';
import { useBadgeDefinitions, useUserBadges } from '@/hooks/useBadges';
import { useReactionsGivenCount } from '@/hooks/useReactionsGivenCount';
import { usePollVotesCount } from '@/hooks/usePollVotesCount';
import { useChallengeSuggestionCounts } from '@/hooks/useChallengeSuggestionCounts';
import { useFriendCount } from '@/hooks/useProfile';
import { useChangeProfilePhoto } from '@/hooks/useChangeProfilePhoto';
import { getRankBorderColor } from '@/lib/rankTitle';
import { hrefWithReturnTo } from '@/lib/navigationReturn';
import type { BadgeProgressStats } from '@/lib/badgeProgress';
import type { Profile } from '@/types/database';

export default function MyProfileScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile) as Profile | null;
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const { openChangePhotoDialog, uploading } = useChangeProfilePhoto();
  const { data: allBadges = [] } = useBadgeDefinitions();
  const { data: earnedBadges = [] } = useUserBadges(profile?.id);
  const { data: reactionsGiven = 0 } = useReactionsGivenCount(profile?.id);
  const { data: pollVotes = 0 } = usePollVotesCount(profile?.id);
  const { data: friendsCount = 0 } = useFriendCount(profile?.id);
  const { data: ideaCounts } = useChallengeSuggestionCounts(profile?.id);
  const [refreshing, setRefreshing] = useState(false);

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
      friendsCount,
      challengeIdeasSubmitted: ideaCounts?.submitted ?? 0,
      challengeIdeasPicked: ideaCounts?.picked ?? 0,
    };
  }, [profile, reactionsGiven, pollVotes, friendsCount, ideaCounts?.submitted, ideaCounts?.picked]);

  const onRefresh = useCallback(async () => {
    if (!profile?.id) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['userBadges', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
        queryClient.invalidateQueries({ queryKey: ['reactionsGiven', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['pollVotesCount', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['friendCount', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['challengeSuggestionCounts', profile.id] }),
        fetchProfile(profile.id),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [profile?.id, queryClient, fetchProfile]);

  const heroAvatarSize = 90;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1, backgroundColor: colors.background },
        scrollContent: { paddingBottom: Spacing.xxl },
        topBar: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.xs,
          paddingBottom: Spacing.sm,
        },
        hero: {
          alignItems: 'center',
          paddingHorizontal: Spacing.xl,
          paddingBottom: Spacing.md,
          gap: Spacing.sm,
        },
        avatarBlock: {
          alignSelf: 'center',
          position: 'relative',
          marginBottom: Spacing.sm,
          marginTop: Spacing.xs,
        },
        avatarShadowWrap: Platform.select({
          ios: {
            shadowColor: colors.shadowBase,
            shadowOpacity: 0.1,
            shadowRadius: 20,
            shadowOffset: { width: 0, height: 10 },
          },
          android: { elevation: 8 },
          default: {},
        }) as object,
        avatarGradientRing: { padding: 3, borderRadius: Radius.full },
        avatarInnerWell: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
        editFab: {
          position: 'absolute',
          right: 0,
          bottom: 0,
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 3,
          borderColor: colors.background,
        },
        statsRow: {
          flexDirection: 'row',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
        },
        statCard: {
          flex: 1,
          backgroundColor: colors.surface,
          borderRadius: Radius.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: Spacing.md,
          alignItems: 'center',
          gap: 4,
          ...Shadows.card,
        },
        section: {
          paddingHorizontal: Spacing.md,
          marginBottom: Spacing.xs,
        },
        sectionHeader: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: Spacing.md,
        },
        bio: {
          marginTop: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          textAlign: 'center',
          lineHeight: 22,
        },
        badgesSection: {
          paddingTop: Spacing.sm,
        },
      }),
    [colors],
  );

  if (!profile) return null;

  const gradient = profile.avatar_gradient ?? [colors.xpGradientStart, colors.xpGradientEnd];
  const rankBorderColor = getRankBorderColor(profile.level ?? 1, colors);

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
          <View style={{ width: 26 }} />
          <TouchableOpacity
            onPress={() => router.push(hrefWithReturnTo('/(app)/profile/settings', pathname))}
            hitSlop={16}
            accessibilityLabel="Settings"
            onPressIn={() => Haptics.selectionAsync()}
          >
            <IconSettings size={26} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View style={styles.avatarBlock}>
            <View style={styles.avatarShadowWrap}>
              {/* Outer rank-tier border ring */}
              <View style={{
                padding: 3,
                borderRadius: Radius.full,
                borderWidth: 2.5,
                borderColor: rankBorderColor,
              }}>
                <LinearGradient
                  colors={gradient as [string, string]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarGradientRing}
                >
                  <View
                    style={[
                      styles.avatarInnerWell,
                      {
                        width: heroAvatarSize,
                        height: heroAvatarSize,
                        borderRadius: heroAvatarSize / 2,
                        backgroundColor: colors.surfaceElevated,
                      },
                    ]}
                  >
                    <Avatar
                      uri={profile.avatar_url}
                      username={profile.username}
                      size={heroAvatarSize}
                      fallbackTone={profile.avatar_url ? 'default' : 'brand'}
                    />
                  </View>
                </LinearGradient>
              </View>
            </View>
            <TouchableOpacity
              style={styles.editFab}
              onPress={openChangePhotoDialog}
              disabled={uploading}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Change profile photo"
              activeOpacity={0.85}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={colors.onAccent} />
              ) : (
                <IconCamera size={17} color={colors.onAccent} />
              )}
            </TouchableOpacity>
          </View>

          <Text variant="headingLarge" style={{ textAlign: 'center' }}>
            {profile.display_name}
          </Text>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
            @{profile.username}
          </Text>
          {profile.bio?.trim() ? (
            <Text variant="body" color={colors.textSecondary} style={styles.bio}>
              {profile.bio.trim()}
            </Text>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: Spacing.sm,
              flexWrap: 'wrap',
              marginTop: Spacing.xs,
            }}
          >
            <RankBadge level={profile.level ?? 1} />
            <LevelBadge level={profile.level ?? 1} />
          </View>

          <View style={{ width: '100%', paddingHorizontal: Spacing.md, marginTop: Spacing.sm }}>
            <XPBar xp={profile.xp ?? 0} level={profile.level ?? 1} />
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <IconReactionFire size={28} color={colors.primary} />
              <Text variant="displayMedium" color={colors.primary}>
                {profile.current_streak ?? 0}
              </Text>
            </View>
            <Text variant="micro" color={colors.textSecondary}>
              Streak
            </Text>
            {(profile.streak_shields ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                <Text variant="nano" color={colors.textTertiary}>🛡️</Text>
                <Text variant="nano" color={colors.textTertiary}>
                  {profile.streak_shields} shield{profile.streak_shields === 1 ? '' : 's'}
                </Text>
              </View>
            )}
          </View>
          <View style={styles.statCard}>
            <Text variant="displayMedium" color={colors.text}>
              {profile.total_completions ?? 0}
            </Text>
            <Text variant="micro" color={colors.textSecondary}>
              Done
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text variant="displayMedium" color={colors.accent}>
              {profile.reactions_received ?? 0}
            </Text>
            <Text variant="micro" color={colors.textSecondary}>
              Reactions
            </Text>
          </View>
        </View>

        {/* Badges */}
        {allBadges.length > 0 && (
          <View style={[styles.section, styles.badgesSection]}>
            <View style={styles.sectionHeader}>
              <Text variant="headingMedium">Badges</Text>
              <Text variant="caption" color={colors.textTertiary}>
                {earnedBadges.length}/{allBadges.length}
              </Text>
            </View>
            <BadgesGrid badges={allBadges} earned={earnedBadges} progressStats={badgeProgressStats} />
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
