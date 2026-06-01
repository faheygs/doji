import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  SafeAreaView,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useRouter, usePathname, useLocalSearchParams, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Spacing, webScrollParentStyle } from '../../../constants/theme';
import { useTheme } from '../../../contexts/ThemeContext';
import { Text } from '../../../components/ui/Text';
import { Input } from '../../../components/ui/Input';
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { IconChevronLeft, IconCheck } from '../../../components/icons/Icons';
import { useSearchUsers } from '../../../hooks/useProfile';
import { useFollow, useFollowStatus } from '../../../hooks/useFollows';
import { useAuthStore } from '../../../stores/useAuthStore';
import type { Profile } from '../../../types/database';
import { hrefWithReturnTo, goBackWithOptionalReturn } from '../../../lib/navigationReturn';

export default function AddFriendsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const { data: results = [], isLoading } = useSearchUsers(query);
  const currentProfile = useAuthStore((s) => s.profile);

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
        searchContainer: {
          paddingHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
        },
        list: {
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        centered: {
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        },
        empty: {
          alignItems: 'center',
          paddingTop: Spacing.xxl,
          gap: Spacing.md,
        },
      }),
    [colors.background],
  );

  const filteredResults = useMemo(
    () => results.filter((r) => r.id !== currentProfile?.id),
    [results, currentProfile?.id],
  );

  return (
    <SafeAreaView style={[styles.container, webScrollParentStyle]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackWithOptionalReturn(router, returnTo, '/(app)/friends' as Href)}
          hitSlop={16}
        >
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text variant="headingLarge">Find people</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <Input
          placeholder="Search by username..."
          value={query}
          onChangeText={setQuery}
          autoFocus
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          style={webScrollParentStyle}
          data={filteredResults}
          keyExtractor={(u) => u.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => <UserResult user={item} returnPath={pathname} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text variant="body" color={colors.textSecondary}>
                {query.length >= 2 ? `No users found for "${query}"` : 'No users yet'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function UserResult({ user, returnPath }: { user: Profile; returnPath: string }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { data: followStatus = 'none' } = useFollowStatus(user.id);
  const follow = useFollow();

  const rowStyles = useMemo(
    () =>
      StyleSheet.create({
        userCard: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        },
        userInfo: {
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
        },
        nameContainer: {
          gap: 2,
        },
        statusBadge: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        },
      }),
    [],
  );

  const isFollowing = followStatus === 'following';
  const isRequested = followStatus === 'pending_out';
  const isPendingIn = followStatus === 'pending_in';

  return (
    <Card style={rowStyles.userCard} elevated>
      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync();
          router.push(hrefWithReturnTo(`/(app)/member/${user.username}`, returnPath));
        }}
        style={rowStyles.userInfo}
        activeOpacity={0.8}
      >
        <Avatar uri={user.avatar_url} username={user.username} size={44} />
        <View style={rowStyles.nameContainer}>
          <Text variant="headingMedium">{user.display_name}</Text>
          <Text variant="bodySmall" color={colors.textSecondary}>
            @{user.username}
          </Text>
        </View>
      </TouchableOpacity>

      {isFollowing ? (
        <View style={rowStyles.statusBadge}>
          <IconCheck size={16} color={colors.success} />
          <Text variant="label" color={colors.success}>
            Following
          </Text>
        </View>
      ) : isRequested ? (
        <Text variant="label" color={colors.textSecondary}>
          Requested
        </Text>
      ) : isPendingIn ? (
        <Text variant="label" color={colors.textSecondary}>
          Follows you
        </Text>
      ) : followStatus === 'blocked' ? (
        <Text variant="label" color={colors.textTertiary}>
          Unavailable
        </Text>
      ) : (
        <Button onPress={() => follow.mutate(user.id)} loading={follow.isPending} size="sm">
          Follow
        </Button>
      )}
    </Card>
  );
}
