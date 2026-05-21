import React, { useMemo, useState } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, usePathname, type Href } from 'expo-router';
import { useTheme } from '../../../contexts/ThemeContext';
import { Typography, Spacing, Radius, Shadows } from '../../../constants/theme';
import { Text } from '../../../components/ui/Text';
import { useLeaderboard, type LeaderboardMode } from '../../../hooks/useLeaderboard';
import { useAuthStore } from '../../../stores/useAuthStore';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LevelBadge } from '../../../components/gamification/LevelBadge';
import { Avatar } from '../../../components/ui/Avatar';
import { getRankTitle, getRankBorderColor } from '../../../lib/rankTitle';
import { hrefWithReturnTo } from '../../../lib/navigationReturn';
import type { LeaderboardEntry } from '../../../types/database';

/** Podium-style rank (no emoji) — #1 gradient burst, #2–3 rings, rest soft pill. */
function RankPosition({ rank }: { rank: number }) {
  const { colors } = useTheme();

  const size = 44;
  const common = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
  };

  if (rank === 1) {
    return (
      <LinearGradient
        colors={[colors.xpGradientStart, colors.xpGradientEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={common}
      >
        <Text variant="headingMedium" style={{ color: colors.onPrimary, fontSize: 17 }}>
          1
        </Text>
      </LinearGradient>
    );
  }

  if (rank === 2) {
    return (
      <View
        style={[
          common,
          {
            backgroundColor: colors.surface,
            borderWidth: 2.5,
            borderColor: colors.primary,
          },
        ]}
      >
        <Text variant="headingMedium" style={{ color: colors.primary, fontSize: 17 }}>
          2
        </Text>
      </View>
    );
  }

  if (rank === 3) {
    return (
      <View
        style={[
          common,
          {
            backgroundColor: colors.surface,
            borderWidth: 2.5,
            borderColor: colors.accent,
          },
        ]}
      >
        <Text variant="headingMedium" style={{ color: colors.accent, fontSize: 17 }}>
          3
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        common,
        {
          backgroundColor: colors.chipBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
      ]}
    >
      <Text
        variant="headingMedium"
        color={colors.textSecondary}
        style={{ fontSize: 15, fontVariant: ['tabular-nums'] }}
      >
        {rank}
      </Text>
    </View>
  );
}

function RankItem({ item, isMe }: { item: LeaderboardEntry; isMe: boolean }) {
  const { colors } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const level = item.profile.level ?? 1;
  const rankTitle = getRankTitle(level);
  const rankBorderColor = getRankBorderColor(level, colors);
  const topThree = item.rank <= 3;

  const styles = useMemo(() => {
    const podiumBorder =
      item.rank === 1
        ? colors.primary
        : item.rank === 2
          ? colors.primary
          : item.rank === 3
            ? colors.accent
            : colors.border;
    const rowBorder = isMe ? colors.primary : topThree ? podiumBorder : colors.border;
    const rowBorderW = isMe ? 2 : topThree ? 1.5 : 1;
    const rowBg = isMe ? colors.primaryLight : topThree ? colors.surfaceElevated : colors.surface;
    return {
      rowBorder,
      rowBorderW,
      rowBg,
      sheet: StyleSheet.create({
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          borderRadius: Radius.lg,
          paddingVertical: Spacing.md,
          paddingHorizontal: Spacing.md,
          gap: Spacing.md,
        },
        rankWrap: { width: 44, alignItems: 'center', justifyContent: 'center' },
        nameBlock: { flex: 1, minWidth: 0, gap: 3 },
        rightBlock: { alignItems: 'flex-end', gap: 6 },
        xpLine: { ...Typography.subhead },
      }),
    };
  }, [colors, topThree, isMe, item.rank]);

  const handlePress = () => {
    if (isMe) {
      router.push('/(app)/profile' as Href);
    } else if (item.profile.username) {
      router.push(hrefWithReturnTo(`/(app)/member/${item.profile.username}`, pathname));
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      style={[
        styles.sheet.row,
        {
          backgroundColor: styles.rowBg,
          borderColor: styles.rowBorder,
          borderWidth: styles.rowBorderW,
          ...Shadows.card,
        },
      ]}
    >
      <View style={styles.sheet.rankWrap}>
        <RankPosition rank={item.rank} />
      </View>

      <Avatar
        uri={item.profile.avatar_url}
        username={item.profile.display_name ?? item.profile.username}
        size={topThree ? 48 : 44}
        rankBorderColor={rankBorderColor}
      />

      <View style={styles.sheet.nameBlock}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Text variant="body" numberOfLines={1} style={{ flexShrink: 1, fontWeight: '700' }}>
            {item.profile.display_name || item.profile.username}
          </Text>
          {isMe ? (
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: Radius.full,
                backgroundColor: colors.primaryPale,
              }}
            >
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

      <View style={styles.sheet.rightBlock}>
        <Text style={[styles.sheet.xpLine, { color: colors.primary }]}>{item.xp.toLocaleString()} XP</Text>
        <LevelBadge level={level} small />
      </View>
    </TouchableOpacity>
  );
}

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [mode, setMode] = useState<LeaderboardMode>('weekly');
  const { data: entries, isLoading, isError, refetch, isRefetching } = useLeaderboard(mode);

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
        toggleWrap: {
          flexDirection: 'row',
          marginHorizontal: Spacing.lg,
          marginBottom: Spacing.md,
          padding: 3,
          borderRadius: Radius.full,
          backgroundColor: colors.chipBackground,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.border,
        },
        toggleSeg: {
          flex: 1,
          paddingVertical: Spacing.sm,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: Radius.full,
        },
        toggleSegActive: {
          backgroundColor: colors.primary,
        },
        hint: {
          paddingHorizontal: Spacing.lg,
          marginBottom: Spacing.md,
        },
        empty: { marginTop: 72, paddingHorizontal: Spacing.xl },
      }),
    [colors],
  );

  return (
    <View style={[layout.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <View style={layout.headerBlock}>
        <Text variant="displayLarge" style={{ letterSpacing: -0.5 }}>
          Leaderboard
        </Text>
        <Text variant="body" color={colors.textSecondary} style={layout.subtitle}>
          {"The community's top performers."}
        </Text>
      </View>

      <View style={layout.toggleWrap}>
        {(['weekly', 'alltime'] as LeaderboardMode[]).map((opt) => {
          const active = mode === opt;
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => setMode(opt)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[layout.toggleSeg, active && layout.toggleSegActive]}
            >
              <Text
                variant="label"
                style={{ letterSpacing: 0.4 }}
                color={active ? colors.onPrimary : colors.textSecondary}
              >
                {opt === 'weekly' ? 'This week' : 'All time'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text variant="caption" color={colors.textTertiary} style={layout.hint}>
        {mode === 'weekly' ? 'Board resets every Monday morning.' : 'Ranked by total XP ever earned.'}
      </Text>

      {isError ? (
        <ErrorState
          title="Couldn't load rankings"
          message="Pull down to refresh or try again later."
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: Spacing.xxl }} />
      ) : (
        <FlatList
          data={entries}
          keyExtractor={(item) => item.user_id}
          renderItem={({ item }) => <RankItem item={item} isMe={item.user_id === userId} />}
          contentContainerStyle={{ paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl }}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={layout.empty}>
              <Text variant="headingLarge" color={colors.textSecondary} style={{ textAlign: 'center' }}>
                {"You're early"}
              </Text>
              <Text
                variant="body"
                color={colors.textTertiary}
                style={{ textAlign: 'center', marginTop: Spacing.sm, lineHeight: 22 }}
              >
                {
                  'Complete daily Dojis to earn XP — when others join in, their names will show up here.'
                }
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
