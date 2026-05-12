import React, { useMemo } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius, webScrollParentStyle } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { Text } from '../../../components/ui/Text';
import { Avatar } from '../../../components/ui/Avatar';
import { Card } from '../../../components/ui/Card';
import { IconChevronRight, IconFriends } from '../../../components/icons/Icons';
import { useFriends, useFriendRequests } from '../../../hooks/useProfile';
import type { Profile } from '../../../types/database';

export default function FriendsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: friends = [], isLoading } = useFriends();
  const { data: requests = [] } = useFriendRequests();

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
        <Text variant="headingLarge">Friends</Text>
        <TouchableOpacity
          onPress={() => router.push('/(app)/friends/add')}
          style={styles.addButton}
          onPressIn={() => Haptics.selectionAsync()}
        >
          <Text variant="headingMedium" color={colors.link}>
            Add
          </Text>
        </TouchableOpacity>
      </View>

      {requests.length > 0 && (
        <TouchableOpacity
          onPress={() => router.push('/(app)/friends/requests')}
          style={styles.requestsBanner}
          activeOpacity={0.8}
        >
          <IconFriends size={22} color={colors.textSecondary} />
          <Text variant="body" style={{ flex: 1, color: colors.text }}>
            {requests.length} friend request{requests.length > 1 ? 's' : ''}
          </Text>
          <IconChevronRight size={20} color={colors.textTertiary} />
        </TouchableOpacity>
      )}

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          style={webScrollParentStyle}
          data={friends}
          keyExtractor={(f) => f.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <FriendCard
              friend={item}
              cardStyle={styles.friendCard}
              infoStyle={styles.friendInfo}
              statsStyle={styles.friendStats}
              onPress={() => {
                Haptics.selectionAsync();
                router.push(`/profile/${item.username}`);
              }}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <IconFriends size={48} color={colors.textTertiary} />
              <Text variant="headingLarge">No friends yet</Text>
              <Text variant="body" color={colors.textSecondary} style={styles.emptyText}>
                Add friends to see their challenges and compete on streaks.
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

function FriendCard({
  friend,
  onPress,
  cardStyle,
  infoStyle,
  statsStyle,
}: {
  friend: Profile;
  onPress: () => void;
  cardStyle: object;
  infoStyle: object;
  statsStyle: object;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
      <Card style={cardStyle} elevated>
        <Avatar uri={friend.avatar_url} username={friend.username} size={48} />
        <View style={infoStyle}>
          <Text variant="headingMedium">{friend.display_name}</Text>
          <Text variant="bodySmall" color={colors.textSecondary}>
            @{friend.username}
          </Text>
        </View>
        <View style={statsStyle}>
          <Text variant="headingMedium" color={colors.text}>
            {friend.current_streak}
          </Text>
          <Text variant="label" color={colors.textSecondary}>
            STREAK
          </Text>
        </View>
      </Card>
    </TouchableOpacity>
  );
}
