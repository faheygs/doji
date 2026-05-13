import React, { useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../contexts/ThemeContext';
import { Typography, Spacing, Radius, Shadows } from '../../../constants/theme';
import { useLeaderboard, type LeaderboardMode } from '../../../hooks/useLeaderboard';
import { useAuthStore } from '../../../stores/useAuthStore';
import { ErrorState } from '../../../components/ui/ErrorState';
import { LevelBadge } from '../../../components/gamification/LevelBadge';
import type { LeaderboardEntry } from '../../../types/database';

const MEDALS = ['🥇', '🥈', '🥉'];

function RankItem({ item, isMe }: { item: LeaderboardEntry; isMe: boolean }) {
  const { colors } = useTheme();
  const medal = item.rank <= 3 ? MEDALS[item.rank - 1] : null;

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: isMe ? colors.primaryLight : colors.surface,
          borderColor: isMe ? colors.primary : colors.border,
          ...Shadows.card,
        },
      ]}
    >
      <View style={styles.rankCell}>
        {medal ? (
          <Text style={styles.medal}>{medal}</Text>
        ) : (
          <Text style={[styles.rankNum, { color: colors.textSecondary }]}>
            {item.rank}
          </Text>
        )}
      </View>

      <View
        style={[
          styles.avatar,
          {
            borderColor: item.profile.avatar_gradient?.[0] ?? colors.primary,
            backgroundColor: colors.surfaceMuted,
          },
        ]}
      >
        <Text style={[styles.avatarText, { color: colors.text }]}>
          {(item.profile.display_name || item.profile.username || '?')[0].toUpperCase()}
        </Text>
      </View>

      <View style={styles.nameCol}>
        <Text style={[Typography.body, { color: colors.text }]} numberOfLines={1}>
          {item.profile.display_name || item.profile.username}
        </Text>
        <Text style={[Typography.micro, { color: colors.textTertiary }]}>
          @{item.profile.username}
        </Text>
      </View>

      <View style={styles.rightCol}>
        <Text style={[Typography.subhead, { color: colors.primary }]}>
          {item.xp.toLocaleString()} XP
        </Text>
        <LevelBadge level={item.profile.level} small />
      </View>
    </View>
  );
}

export default function LeaderboardScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const userId = useAuthStore((s) => s.session?.user?.id);
  const [mode, setMode] = useState<LeaderboardMode>('weekly');
  const { data: entries, isLoading, isError, refetch, isRefetching } = useLeaderboard(mode);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={[Typography.display, { color: colors.text, paddingHorizontal: Spacing.lg, paddingTop: Spacing.md, paddingBottom: Spacing.sm }]}>
        Rankings
      </Text>

      {/* Mode Toggle */}
      <View style={[styles.toggleContainer, { backgroundColor: colors.surfaceMuted, borderRadius: Radius.full, marginHorizontal: Spacing.lg, marginBottom: Spacing.md }]}>
        {(['weekly', 'alltime'] as LeaderboardMode[]).map((opt) => {
          const active = mode === opt;
          return (
            <TouchableOpacity
              key={opt}
              onPress={() => setMode(opt)}
              style={[
                styles.toggleSegment,
                active && { backgroundColor: colors.surface, borderRadius: Radius.full },
              ]}
            >
              <Text style={[Typography.body, { color: active ? colors.text : colors.textTertiary }]}>
                {opt === 'weekly' ? 'This Week' : 'All Time'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={[Typography.caption, { color: colors.textTertiary, paddingHorizontal: Spacing.lg, marginBottom: Spacing.sm }]}>
        {mode === 'weekly' ? 'Resets every Monday' : 'Total XP earned'}
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
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={[Typography.heading, { color: colors.textSecondary, textAlign: 'center' }]}>
                No rankings yet
              </Text>
              <Text style={[Typography.caption, { color: colors.textTertiary, textAlign: 'center', marginTop: Spacing.xs }]}>
                Complete challenges to earn XP!
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  toggleContainer: {
    flexDirection: 'row',
    padding: 3,
  },
  toggleSegment: {
    flex: 1,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: Radius.lg,
    borderWidth: 1,
    padding: Spacing.md,
  },
  rankCell: { width: 36, alignItems: 'center' },
  medal: { fontSize: 22 },
  rankNum: { ...Typography.subhead },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Spacing.sm,
  },
  avatarText: { fontSize: 16, fontWeight: '700' },
  nameCol: { flex: 1 },
  rightCol: { alignItems: 'flex-end', gap: 4 },
  empty: { marginTop: 80, paddingHorizontal: Spacing.lg },
});
