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
import { useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, Shadows, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { IconCamera, IconSettings, IconFriends } from '@/components/icons/Icons';
import { XPBar } from '@/components/gamification/XPBar';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { BadgesGrid } from '@/components/gamification/BadgesGrid';
import { ProfilePostsGrid } from '@/components/profile/ProfilePostsGrid';
import { useAuthStore } from '@/stores/useAuthStore';
import { useProfilePosts } from '@/hooks/useProfile';
import { useBadgeDefinitions, useUserBadges } from '@/hooks/useBadges';
import { useChangeProfilePhoto } from '@/hooks/useChangeProfilePhoto';
import type { Post, Profile } from '@/types/database';

export default function MyProfileScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const profile = useAuthStore((s) => s.profile) as Profile | null;
  const { openChangePhotoDialog, uploading } = useChangeProfilePhoto();
  const { data: posts = [] } = useProfilePosts(profile?.id);
  const { data: allBadges = [] } = useBadgeDefinitions();
  const { data: earnedBadges = [] } = useUserBadges(profile?.id);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    if (!profile?.id) return;
    setRefreshing(true);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['profilePosts', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['userBadges', profile.id] }),
        queryClient.invalidateQueries({ queryKey: ['profile'] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [profile?.id, queryClient]);

  const openPost = useCallback(
    (post: Post) => {
      Haptics.selectionAsync();
      router.push(`/(app)/post/${post.id}` as Href);
    },
    [router],
  );

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
          ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 20, shadowOffset: { width: 0, height: 10 } },
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
          backgroundColor: colors.accent,
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
          marginBottom: Spacing.xs,
        },
        friendsLink: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          backgroundColor: colors.surface,
          borderRadius: Radius.md,
          borderWidth: 1,
          borderColor: colors.border,
          padding: Spacing.md,
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          ...Shadows.card,
        },
      }),
    [colors],
  );

  if (!profile) return null;

  const gradient = profile.avatar_gradient ?? [colors.xpGradientStart, colors.xpGradientEnd];

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <ScrollView
        style={webScrollParentStyle}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.text} />}
      >
        <View style={styles.topBar}>
          <View style={{ width: 26 }} />
          <TouchableOpacity
            onPress={() => router.push('/(app)/settings')}
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

          <LevelBadge level={profile.level ?? 1} />

          <View style={{ width: '100%', paddingHorizontal: Spacing.md, marginTop: Spacing.xs }}>
            <XPBar xp={profile.xp ?? 0} level={profile.level ?? 1} />
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text variant="displayMedium" color={colors.primary}>
              🔥 {profile.current_streak ?? 0}
            </Text>
            <Text variant="micro" color={colors.textSecondary}>Streak</Text>
          </View>
          <View style={styles.statCard}>
            <Text variant="displayMedium" color={colors.text}>
              {profile.total_completions ?? 0}
            </Text>
            <Text variant="micro" color={colors.textSecondary}>Done</Text>
          </View>
          <View style={styles.statCard}>
            <Text variant="displayMedium" color={colors.accent}>
              {profile.reactions_received ?? 0}
            </Text>
            <Text variant="micro" color={colors.textSecondary}>Reactions</Text>
          </View>
        </View>

        {/* Friends link */}
        <TouchableOpacity
          style={styles.friendsLink}
          onPress={() => router.push('/(app)/friends' as Href)}
          activeOpacity={0.8}
        >
          <IconFriends size={22} color={colors.primary} />
          <Text variant="body" color={colors.text} style={{ flex: 1 }}>Friends</Text>
          <Text variant="caption" color={colors.textTertiary}>→</Text>
        </TouchableOpacity>

        {/* Badges */}
        {allBadges.length > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="headingMedium">Badges</Text>
              <Text variant="caption" color={colors.textTertiary}>
                {earnedBadges.length}/{allBadges.length}
              </Text>
            </View>
            <BadgesGrid badges={allBadges} earned={earnedBadges} />
          </View>
        )}

        {/* Posts Grid */}
        <ProfilePostsGrid
          posts={posts}
          emptyHint="No posts yet. Complete today's challenge to share!"
          onPostPress={openPost}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
