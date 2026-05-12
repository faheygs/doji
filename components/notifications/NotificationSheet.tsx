import React, { useEffect, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconBell, IconClose, IconFriends } from '../icons/Icons';
import type { NotificationCenterItem } from '../../hooks/useNotificationCenter';
import { useRespondToFriendRequest } from '../../hooks/useProfile';
import { formatRelativeTime } from '../../utils/time';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: NotificationCenterItem[];
  isLoading: boolean;
};

export function NotificationSheet({ visible, onClose, items, isLoading }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useTheme();
  const respond = useRespondToFriendRequest();

  useEffect(() => {
    if (!visible) return;
    queryClient.invalidateQueries({ queryKey: ['friendRequests'] });
    queryClient.invalidateQueries({ predicate: (q) => q.queryKey[0] === 'notificationCenter' });
  }, [visible, queryClient]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        flex: {
          flex: 1,
          backgroundColor: colors.background,
        },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.md,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        list: {
          padding: Spacing.md,
          paddingBottom: Spacing.sm,
          gap: Spacing.sm,
          flexGrow: 1,
        },
        card: {
          padding: Spacing.md,
          gap: Spacing.md,
        },
        userRow: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        userMeta: {
          flex: 1,
          gap: 2,
        },
        actions: {
          flexDirection: 'row',
          gap: Spacing.sm,
        },
        empty: {
          alignItems: 'center',
          paddingTop: Spacing.xxl * 2,
          paddingHorizontal: Spacing.xl,
          gap: Spacing.sm,
        },
        emptySub: {
          textAlign: 'center',
          lineHeight: 20,
        },
        footer: {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.hairline,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.md,
          paddingBottom: Spacing.lg,
        },
        footerBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: Spacing.sm,
          paddingVertical: Spacing.sm,
        },
        centered: {
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          paddingTop: Spacing.xxl,
        },
        rowTitle: {
          marginBottom: Spacing.xs,
        },
      }),
    [colors],
  );

  const openFriends = useCallback(() => {
    Haptics.selectionAsync();
    onClose();
    router.push('/(app)/friends');
  }, [onClose, router]);

  const openProfile = useCallback(
    (username: string | undefined) => {
      if (!username) return;
      Haptics.selectionAsync();
      router.push(`/profile/${username}`);
    },
    [router],
  );

  const openPost = useCallback(
    (postId: string) => {
      Haptics.selectionAsync();
      router.push(`/(app)/post/${postId}`);
    },
    [router],
  );

  const openChallenge = useCallback(() => {
    Haptics.selectionAsync();
    onClose();
    router.push('/(app)/challenge');
  }, [onClose, router]);

  const renderItem = useCallback(
    ({ item }: { item: NotificationCenterItem }) => {
      switch (item.kind) {
        case 'friend_request': {
          const fr = item.friendship;
          const requester = fr.requester;
          return (
            <Card style={styles.card} elevated padded={false}>
              <TouchableOpacity
                onPress={() => openProfile(requester?.username)}
                style={styles.userRow}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Friend request from ${requester?.username ?? 'user'}`}
              >
                <Avatar uri={requester?.avatar_url} username={requester?.username} size={44} />
                <View style={styles.userMeta}>
                  <Text variant="headingMedium">{requester?.display_name ?? 'Someone'}</Text>
                  <Text variant="bodySmall" color={colors.textSecondary}>
                    @{requester?.username ?? '…'} wants to connect ·{' '}
                    {formatRelativeTime(fr.created_at)}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.actions}>
                <Button
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    respond.mutate({ friendshipId: fr.id, accept: true });
                  }}
                  size="sm"
                  loading={respond.isPending}
                >
                  Accept
                </Button>
                <Button
                  onPress={() => respond.mutate({ friendshipId: fr.id, accept: false })}
                  size="sm"
                  variant="ghost"
                  loading={respond.isPending}
                >
                  Decline
                </Button>
              </View>
            </Card>
          );
        }
        case 'friend_accepted': {
          const f = item.friendship;
          const addressee = f.addressee;
          return (
            <Card style={styles.card} elevated padded={false}>
              <TouchableOpacity
                onPress={() => openProfile(addressee?.username)}
                style={styles.userRow}
                activeOpacity={0.85}
              >
                <Avatar uri={addressee?.avatar_url} username={addressee?.username} size={44} />
                <View style={styles.userMeta}>
                  <Text variant="headingMedium" style={styles.rowTitle}>
                    {"You're friends"}
                  </Text>
                  <Text variant="bodySmall" color={colors.textSecondary}>
                    @{addressee?.username ?? '…'} accepted your request ·{' '}
                    {formatRelativeTime(item.sortAt)}
                  </Text>
                </View>
              </TouchableOpacity>
            </Card>
          );
        }
        case 'reaction': {
          const { reaction, actor } = item;
          return (
            <Card style={styles.card} elevated padded={false}>
              <TouchableOpacity
                onPress={() => openPost(reaction.post_id)}
                style={styles.userRow}
                activeOpacity={0.85}
              >
                <Avatar uri={actor.avatar_url} username={actor.username} size={44} />
                <View style={styles.userMeta}>
                  <Text variant="headingMedium" style={styles.rowTitle}>
                    New reaction
                  </Text>
                  <Text variant="bodySmall" color={colors.textSecondary}>
                    @{actor.username ?? '…'} reacted {reaction.emoji} to your post ·{' '}
                    {formatRelativeTime(reaction.created_at)}
                  </Text>
                </View>
              </TouchableOpacity>
            </Card>
          );
        }
        case 'challenge': {
          const ue = item.userEvent;
          const title = ue.challenge?.title ?? 'Challenge';
          return (
            <Card style={styles.card} elevated padded={false}>
              <TouchableOpacity onPress={openChallenge} style={styles.userMeta} activeOpacity={0.85}>
                <Text variant="headingMedium" style={styles.rowTitle}>
                  Challenge ready
                </Text>
                <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={2}>
                  {title} · {formatRelativeTime(item.sortAt)}
                </Text>
              </TouchableOpacity>
            </Card>
          );
        }
        default:
          return null;
      }
    },
    [
      colors.textSecondary,
      openChallenge,
      openPost,
      openProfile,
      respond,
      styles.actions,
      styles.card,
      styles.rowTitle,
      styles.userMeta,
      styles.userRow,
    ],
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.flex}>
        <View style={styles.header}>
          <Text variant="headingLarge">Notifications</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Close notifications"
          >
            <IconClose size={22} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {visible && isLoading && items.length === 0 ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.text} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(i) => i.key}
            contentContainerStyle={styles.list}
            renderItem={renderItem}
            ListEmptyComponent={
              <View style={styles.empty}>
                <IconBell size={44} color={colors.textTertiary} />
                <Text variant="headingMedium">{"You're all caught up"}</Text>
                <Text variant="bodySmall" color={colors.textSecondary} style={styles.emptySub}>
                  {
                    "Friend requests, acceptances, reactions on your posts, and new challenges appear here. We'll ping you when something lands."
                  }
                </Text>
              </View>
            }
          />
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            onPress={openFriends}
            style={styles.footerBtn}
            accessibilityRole="button"
            accessibilityLabel="Open friends"
          >
            <IconFriends size={20} color={colors.link} />
            <Text variant="body" color={colors.link}>
              Friends & invites
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
