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
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, Shadows, webScrollParentStyle } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { Text } from '@/components/ui/Text';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LevelBadge } from '@/components/gamification/LevelBadge';
import { RankBadge } from '@/components/gamification/RankBadge';
import { XPBar } from '@/components/gamification/XPBar';
import {
  IconChevronLeft,
  IconChevronRight,
  IconCheck,
  IconClose,
  IconFriends,
  IconReactionFire,
  IconSend,
  IconUsers,
} from '@/components/icons/Icons';
import { ProfileFriendsSheet } from '@/components/profile/ProfileFriendsSheet';
import { ProfileStats } from '@/components/profile/ProfileStats';
import {
  useProfile,
  useFriendship,
  useSendFriendRequest,
  useRespondToFriendRequest,
  useRemoveFriend,
  useFriendCount,
} from '@/hooks/useProfile';
import { useAuthStore } from '@/stores/useAuthStore';
import { getCompletionRate } from '@/utils/time';
import { goBackWithOptionalReturn, FEED_TAB_HREF } from '@/lib/navigationReturn';
import { formatCompactCount } from '@/utils/formatCount';
import { getRankBorderColor } from '@/lib/rankTitle';

const HERO_AVATAR = 90;

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
        avatarInnerWell: {
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
        bio: {
          marginTop: Spacing.sm,
          paddingHorizontal: Spacing.lg,
          textAlign: 'center',
          lineHeight: 22,
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
          marginTop: Spacing.sm,
        },
        sectionHeader: {
          marginBottom: Spacing.md,
        },
        friendsRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        },
        friendsIconWrap: {
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.surfaceMuted,
        },
        friendsChev: { marginLeft: 'auto' },
        friendsCardWrap: {
          paddingHorizontal: Spacing.md,
          marginBottom: Spacing.md,
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        friendActionButton: {
          minWidth: 120,
          paddingHorizontal: Spacing.md,
          borderRadius: Radius.md,
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

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.container, webScrollParentStyle]}>
        <View style={styles.topBar}>
          {headerBack}
          <View style={{ flex: 1 }} />
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
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

  const completionRate = getCompletionRate(
    profile.total_completions,
    profile.total_completions + profile.total_missed,
  );

  const pendingIncoming =
    friendship?.status === 'pending' && friendship.addressee_id === currentProfile?.id;
  const pendingOutgoing =
    friendship?.status === 'pending' && friendship.requester_id === currentProfile?.id;

  const handleFriendAction = () => {
    if (friendship?.status === 'accepted') return;
    if (pendingIncoming && friendship?.id) {
      respondRequest.mutate({ friendshipId: friendship.id, accept: true });
      return;
    }
    if (!friendship || friendship.status !== 'pending') {
      sendRequest.mutate(profile.id);
    }
  };

  const friendDisabled = pendingOutgoing || sendRequest.isPending || respondRequest.isPending;

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

  const gradient = (profile.avatar_gradient?.length === 2
    ? profile.avatar_gradient
    : [colors.xpGradientStart, colors.xpGradientEnd]) as [string, string];
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
          {headerBack}
          <View style={styles.topBarActions}>
            {friendship?.status === 'accepted' ? (
              <Button
                onPress={handleUnfriend}
                variant="danger"
                size="md"
                loading={removeFriend.isPending}
                disabled={removeFriend.isPending}
                leftIcon={<IconClose size={17} color={colors.error} />}
                style={styles.friendActionButton}
              >
                Unfriend
              </Button>
            ) : pendingOutgoing ? (
              <Button
                onPress={() => {}}
                variant="secondary"
                size="md"
                disabled
                leftIcon={<IconSend size={16} color={colors.textTertiary} />}
                style={styles.friendActionButton}
              >
                Request sent
              </Button>
            ) : (
              <Button
                onPress={handleFriendAction}
                variant="primary"
                size="md"
                loading={sendRequest.isPending || respondRequest.isPending}
                disabled={friendDisabled}
                leftIcon={
                  pendingIncoming ? (
                    <IconCheck size={17} color={colors.onPrimary} />
                  ) : (
                    <IconUsers size={17} color={colors.onPrimary} />
                  )
                }
                style={[styles.friendActionButton, Shadows.card]}
              >
                {pendingIncoming ? 'Accept request' : 'Add friend'}
              </Button>
            )}
          </View>
        </View>

        {/* Hero — matches (app)/profile/index layout */}
        <View style={styles.hero}>
          <View style={styles.avatarBlock}>
            <View style={styles.avatarShadowWrap}>
              <View
                style={{
                  padding: 3,
                  borderRadius: Radius.full,
                  borderWidth: 2.5,
                  borderColor: rankBorderColor,
                }}
              >
                <LinearGradient
                  colors={gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.avatarGradientRing}
                >
                  <View
                    style={[
                      styles.avatarInnerWell,
                      {
                        width: HERO_AVATAR,
                        height: HERO_AVATAR,
                        borderRadius: HERO_AVATAR / 2,
                        backgroundColor: colors.surfaceElevated,
                      },
                    ]}
                  >
                    <Avatar
                      uri={profile.avatar_url}
                      username={profile.username}
                      size={HERO_AVATAR}
                      fallbackTone={profile.avatar_url ? 'default' : 'brand'}
                    />
                  </View>
                </LinearGradient>
              </View>
            </View>
          </View>

          <Text variant="headingLarge" style={{ textAlign: 'center' }} numberOfLines={2}>
            {profile.display_name}
          </Text>
          <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }} numberOfLines={1}>
            @{profile.username}
          </Text>
          {profile.bio?.trim() ? (
            <Text variant="body" color={colors.textSecondary} style={styles.bio} numberOfLines={6}>
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
                <Text variant="nano" color={colors.textTertiary}>
                  🛡️
                </Text>
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

        <View style={styles.friendsCardWrap}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityHint="Opens friend list"
            activeOpacity={0.88}
            onPress={() => {
              Haptics.selectionAsync();
              setFriendsSheetVisible(true);
            }}
          >
            <Card padded>
              <View style={styles.friendsRow}>
                <View style={styles.friendsIconWrap}>
                  <IconFriends size={20} color={colors.primary} />
                </View>
                <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                  <Text variant="headingMedium" numberOfLines={1}>
                    Friends
                  </Text>
                  <Text variant="headingMedium" color={colors.primary} numberOfLines={1}>
                    {formatCompactCount(theirFriendCount)}
                  </Text>
                </View>
                <View style={styles.friendsChev}>
                  <IconChevronRight size={22} color={colors.textTertiary} />
                </View>
              </View>
            </Card>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text variant="headingMedium">Challenge stats</Text>
          </View>
          <ProfileStats
            profile={profile}
            completionRate={completionRate}
            style={{ marginHorizontal: 0, marginBottom: Spacing.sm }}
          />
        </View>
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
