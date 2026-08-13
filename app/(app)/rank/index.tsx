import React, { useMemo, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';
import { Typography, Spacing, Radius, Shadows } from '../../../constants/theme';
import { Text } from '../../../components/ui/Text';
import {
  useLeaderboard,
  type LeaderboardMode,
  type LeaderboardAudience,
} from '../../../hooks/useLeaderboard';
import { useAuthStore } from '../../../stores/useAuthStore';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LevelBadge } from '../../../components/gamification/LevelBadge';
import { Avatar } from '../../../components/ui/Avatar';
import { PodiumTopThree } from '../../../components/leaderboard/PodiumTopThree';
import { getRankTitle, getRankBorderColor } from '../../../lib/rankTitle';
import { resolveAvatarBorderColor, resolveAvatarBorderWidth } from '../../../lib/cosmetics';
import { hrefWithReturnTo } from '../../../lib/navigationReturn';
import type { LeaderboardEntry } from '../../../types/database';
import { useFocusedRealtimeInvalidation } from '../../../hooks/useFocusedRealtimeInvalidation';
function RankItem({ item, isMe }: { item: LeaderboardEntry; isMe: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const level = item.profile.level ?? 1;
  const rankTitle = getRankTitle(level);
  const rankBorderColor = getRankBorderColor(level, colors);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: Radius.lg,
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.md,
          gap: Spacing.md,
          backgroundColor: isMe ? colors.primaryLight : colors.surface,
          borderColor: isMe ? colors.primary : colors.border,
          borderWidth: isMe ? 2 : 1,
          ...Shadows.card,
        },
        rankNum: {
          width: 28,
          textAlign: 'center',
          fontVariant: ['tabular-nums'],
        },
        nameBlock: { flex: 1, minWidth: 0, gap: 3 },
        rightBlock: { alignItems: 'flex-end', gap: 6 },
        xpLine: { ...Typography.subhead },
        youPill: {
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: Radius.full,
          backgroundColor: colors.primaryPale,
        },
      }),
    [colors, isMe],
  );

  const handlePress = () => {
    if (isMe) {
      router.push('/(app)/profile' as Href);
    } else if (item.profile.username) {
      router.push(hrefWithReturnTo(`/(app)/member/${item.profile.username}`, pathname));
    }
  };

  return (
    <TouchableOpacity onPress={handlePress} activeOpacity={0.75} style={styles.row}>
      <Text
        variant="body"
        color={isMe ? colors.primary : colors.textTertiary}
        style={[styles.rankNum, { fontWeight: '700' }]}
      >
        {item.rank}
      </Text>

      <Avatar
        uri={item.profile.avatar_url}
        username={item.profile.display_name ?? item.profile.username}
        size={44}
        borderColor={resolveAvatarBorderColor(item.profile, rankBorderColor)}
        borderWidth={resolveAvatarBorderWidth(item.profile)}
      />

      <View style={styles.nameBlock}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text variant="body" numberOfLines={1} style={{ flexShrink: 1, fontWeight: '700' }}>
            {item.profile.display_name || item.profile.username}
          </Text>
          {isMe ? (
            <View style={styles.youPill}>
              <Text variant="nano" color={colors.primary} style={{ letterSpacing: 0.5 }}>
                YOU
              </Text>
            </View>
          ) : null}
        </View>
        <Text variant="micro" color={rankBorderColor} numberOfLines={1}>
          {rankTitle}
        </Text>
      </View>

      <View style={styles.rightBlock}>
        <Text style={[styles.xpLine, { color: colors.primary }]}>
          {item.xp.toLocaleString()} XP
        </Text>
        <LevelBadge level={level} small />
      </View>
    </TouchableOpacity>
  );
}

function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  labels,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
  labels: Record<T, string>;
}) {
  const { colors } = useTheme();
  const layout = useMemo(
    () =>
      StyleSheet.create({
        wrap: {
          flexDirection: 'row',
          padding: 3,
          borderRadius: Radius.full,
          backgroundColor: colors.chipBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        seg: {
          flex: 1,
          paddingVertical: Spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radius.full,
        },
        segActive: {
          backgroundColor: colors.primary,
        },
      }),
    [colors],
  );

  return (
    <View style={layout.wrap}>
      {options.map((opt) => {
        const active = value === opt;
        return (
          <TouchableOpacity
            key={opt}
            onPress={() => onChange(opt)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[layout.seg, active && layout.segActive]}
          >
            <Text
              variant="label"
              style={{ letterSpacing: 0.4 }}
              color={active ? colors.onPrimary : colors.textSecondary}
            >
              {labels[opt]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
export default function LeaderboardScreen() {
  useFocusedRealtimeInvalidation('leaderboard:global', ['leaderboard']);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [mode, setMode] = useState<LeaderboardMode>('weekly');
  const [audience, setAudience] = useState<LeaderboardAudience>('everyone');
  const { data: entries, isLoading, isError, refetch, isRefetching, isFetching } = useLeaderboard(
    mode,
    audience,
  );

  const restEntries = useMemo(
    () => (entries ?? []).filter((e) => e.rank > 3),
    [entries],
  );

  const layout = useMemo(
    () =>
      StyleSheet.create({
        container: { flex: 1 },
        headerBlock: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.md,
          paddingBottom: Spacing.sm,
        },
        subtitle: { marginTop: 6, lineHeight: 20 },
        toggleBlock: {
          paddingHorizontal: Spacing.lg,
          gap: Spacing.sm,
          marginBottom: Spacing.md,
        },
        hint: {
          paddingHorizontal: Spacing.lg,
          marginBottom: Spacing.md,
        },
        empty: { marginTop: 72, paddingHorizontal: Spacing.xl },
        listPad: {
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.xxl,
        },
        fetchFooter: {
          paddingVertical: Spacing.md,
          alignItems: 'center',
        },
      }),
    [],
  );

  const modeLabels: Record<LeaderboardMode, string> = {
    weekly: 'This week',
    alltime: 'All time',
  };

  const audienceLabels: Record<LeaderboardAudience, string> = {
    friends: 'Friends',
    everyone: 'Everyone',
  };

  const ListHeader = useMemo(
    () => (
      <>
        <View style={layout.headerBlock}>
          <Text variant="displayLarge" style={{ letterSpacing: -0.5 }}>
            Leaderboard
          </Text>
          <Text variant="body" color={colors.textSecondary} style={layout.subtitle}>
            {"The community's top performers."}
          </Text>
        </View>

        <View style={layout.toggleBlock}>
          <SegmentedToggle
            options={['friends', 'everyone'] as const}
            value={audience}
            onChange={setAudience}
            labels={audienceLabels}
          />
          <SegmentedToggle
            options={['weekly', 'alltime'] as const}
            value={mode}
            onChange={setMode}
            labels={modeLabels}
          />
        </View>

        <Text variant="caption" color={colors.textTertiary} style={layout.hint}>
          {mode === 'weekly'
            ? 'Board resets every Monday morning.'
            : 'Ranked by total XP ever earned.'}
        </Text>

        <PodiumTopThree entries={entries ?? []} currentUserId={userId} />

        {isFetching && !entries?.length ? (
          <View style={layout.fetchFooter}>
            <ActivityIndicator color={colors.primary} size="small" />
          </View>
        ) : null}
      </>
    ),
    [layout, colors, audience, mode, entries, userId, isFetching],
  );

  return (
    <View style={[layout.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {isError ? (
        <>
          {ListHeader}
          <ErrorState
            title="Couldn't load rankings"
            message="Pull down to refresh or try again later."
            onRetry={() => void refetch()}
          />
        </>
      ) : (
        <FlatList
          data={restEntries}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => <RankItem item={item} isMe={item.user_id === userId} />}
          ListHeaderComponent={ListHeader}
          contentContainerStyle={layout.listPad}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListFooterComponent={
            isFetching && isLoading ? (
              <View style={layout.fetchFooter}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            !isLoading && !entries?.length ? (
              <View style={layout.empty}>
                <Text variant="headingLarge" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                  {audience === 'friends' ? 'No friends yet' : "You're early"}
                </Text>
                <Text
                  variant="body"
                  color={colors.textTertiary}
                  style={{ textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 }}
                >
                  {audience === 'friends'
                    ? 'Add friends to see them on your friends leaderboard.'
                    : mode === 'weekly'
                      ? 'Complete daily Dojis to earn XP this week.'
                      : 'Complete daily Dojis to earn XP — when others join in, their names will show up here.'}
                </Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}
