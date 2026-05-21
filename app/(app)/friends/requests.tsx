import React, { useMemo } from 'react';
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
import { Avatar } from '../../../components/ui/Avatar';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { IconChevronLeft, IconFriends } from '../../../components/icons/Icons';
import { useFriendRequests, useRespondToFriendRequest } from '../../../hooks/useProfile';
import { formatRelativeTime } from '../../../utils/time';
import { hrefWithReturnTo, goBackWithOptionalReturn } from '../../../lib/navigationReturn';

export default function FriendRequestsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string }>();
  const { colors } = useTheme();
  const { data: requests = [], isLoading } = useFriendRequests();
  const respond = useRespondToFriendRequest();

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
        list: {
          padding: Spacing.md,
          gap: Spacing.sm,
        },
        requestCard: {
          gap: Spacing.md,
        },
        userInfo: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.md,
          flex: 1,
        },
        nameContainer: {
          flex: 1,
          gap: 2,
        },
        actions: {
          flexDirection: 'row',
          gap: Spacing.sm,
          justifyContent: 'flex-end',
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
        },
      }),
    [colors.background],
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBackWithOptionalReturn(router, returnTo, '/(app)/friends' as Href)}
          hitSlop={16}
        >
          <IconChevronLeft size={24} color={colors.textSecondary} />
        </TouchableOpacity>
        <Text variant="headingLarge">Requests</Text>
        <View style={{ width: 40 }} />
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      ) : (
        <FlatList
          style={webScrollParentStyle}
          data={requests}
          keyExtractor={(r) => r.id}
          contentContainerStyle={styles.list}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const requester = item.requester;
            return (
              <Card style={styles.requestCard} elevated>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync();
                    if (requester?.username) router.push(hrefWithReturnTo(`/(app)/member/${requester.username}`, pathname));
                  }}
                  style={styles.userInfo}
                  activeOpacity={0.8}
                >
                  <Avatar
                    uri={requester?.avatar_url}
                    username={requester?.username}
                    size={44}
                  />
                  <View style={styles.nameContainer}>
                    <Text variant="headingMedium">{requester?.display_name ?? 'Unknown'}</Text>
                    <Text variant="bodySmall" color={colors.textSecondary}>
                      @{requester?.username} · {formatRelativeTime(item.created_at)}
                    </Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.actions}>
                  <Button
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      respond.mutate({ friendshipId: item.id, accept: true });
                    }}
                    size="sm"
                    loading={respond.isPending}
                  >
                    Accept
                  </Button>
                  <Button
                    onPress={() => respond.mutate({ friendshipId: item.id, accept: false })}
                    size="sm"
                    variant="ghost"
                    loading={respond.isPending}
                  >
                    Decline
                  </Button>
                </View>
              </Card>
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <IconFriends size={44} color={colors.textTertiary} />
              <Text variant="body" color={colors.textSecondary}>
                No pending requests
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
