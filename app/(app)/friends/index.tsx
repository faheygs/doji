import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, webScrollParentStyle } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { Card } from '../../../components/ui/Card';
import { IconChevronRight, IconFriends, IconSearch } from '../../../components/icons/Icons';
import {
  useFollowing,
  useFollowRequests,
  useUnfollow,
  useFollowingCount,
  type FollowWithProfile,
} from '../../../hooks/useFollows';
import { hrefWithReturnTo } from '../../../lib/navigationReturn';
import { formatCompactCount } from '../../../utils/formatCount';
import { useAuthStore } from '../../../stores/useAuthStore';

export default function FriendsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const meId = useAuthStore((s) => s.session?.user?.id);
  const { data: following = [], isLoading } = useFollowing(meId);
  const { data: requests = [] } = useFollowRequests();
  const { data: followingCount = 0 } = useFollowingCount(meId);
  const unfollow = useUnfollow();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingVertical: Spacing.md,
        },
        addButton: {
          padding: Spacing.sm,
        },
        requestsBanner: {
          flexDirection: 'row',
          alignItems: 'center',
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          backgroundColor: colors.surfaceElevated,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.hairline,
          borderRadius: Radius.sm,
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        list: {
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        friendCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          padding: Spacing.md,
        },
        friendInfo: {
          flex: 1,
          gap: 2,
        },
        friendStats: {
          alignItems: 'center',
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        empty: {
          alignItems: 'center',
          paddingTop: Spacing.xxl * 2,
          gap: Spacing.md,
          paddingHorizontal: Spacing.xl,
        },
        emptyText: {
          textAlign: 'center',
        },
      }),
    [colors],
  );

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text variant="headingLarge">Friends</Text>
          <Text variant="micro" color={colors.textTertiary} style={{ marginTop: 3 }}>
            {formatCompactCount(followingCount)} following
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push(hrefWithReturnTo('/(app)/friends/add', pathname))}
          style={styles.addButton}
          onPressIn={() => Haptics.selectionAsync()}
          accessibilityLabel="Find people"
          accessibilityRole="button"
        >
          <IconSearch size={24} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {requests.length > 0 && (
        <TouchableOpacity
          onPress={() => router.push(hrefWithReturnTo('/(app)/friends/requests', pathname))}
          style={styles.requestsBanner}
          activeOpacity={0.8}
        >
          <IconFriends size={22} color={colors.textSecondary} />
          <Text variant="body" style={{ flex: 1, color: colors.text }}>
            {requests.length} follow request{requests.length > 1 ? 's' : ''}
          </Text>
          <IconChevronRight size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      )}

      {isLoading && following.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          style={webScrollParentStyle}
          data={following}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <FollowingCard
              profile={item}
              cardStyle={styles.friendCard}
              infoStyle={styles.friendInfo}
              statsStyle={styles.friendStats}
              onPress={() => {
                Haptics.selectionAsync();
                router.push(hrefWithReturnTo(`/(app)/member/${item.username}`, pathname));
              }}
              onUnfollow={() => {
                Alert.alert(
                  'Unfollow',
                  `Stop following ${item.display_name ?? item.username}?`,
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Unfollow',
                      style: 'destructive',
                      onPress: () => unfollow.mutate(item.id),
                    },
                  ],
                );
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <IconFriends size={48} color={colors.textTertiary} />
              <Text variant="headingLarge">Not following anyone yet</Text>
              <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
                Follow people to see their challenges and compete on streaks.
              </Text>
              <TouchableOpacity onPress={() => router.push('/(app)/friends/add')}>
                <Text variant="body" color={colors.link}>
                  Find people
                </Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function FollowingCard({
  profile,
  onPress,
  onUnfollow,
  cardStyle,
  infoStyle,
  statsStyle,
}: {
  profile: FollowWithProfile;
  onPress: () => void;
  onUnfollow: () => void;
  cardStyle: object;
  infoStyle: object;
  statsStyle: object;
}) {
  const { colors } = useTheme();
  return (
    <Card style={cardStyle} elevated>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.8}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md }}
      >
        <Avatar uri={profile.avatar_url} username={profile.username} size={48} />
        <View style={infoStyle}>
          <Text variant="headingMedium">{profile.display_name}</Text>
          <Text variant="bodySmall" color={colors.textSecondary}>
            @{profile.username}
          </Text>
        </View>
        <View style={statsStyle}>
          <Text variant="headingMedium" color={colors.text}>
            {profile.current_streak}
          </Text>
          <Text variant="label" color={colors.textSecondary}>
            STREAK
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onUnfollow}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Unfollow"
      >
        <Text variant="label" color={colors.error}>
          Unfollow
        </Text>
      </TouchableOpacity>
    </Card>
  );
}
