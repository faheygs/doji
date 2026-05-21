import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconBell, IconClose, IconFriends } from '../icons/Icons';
import type { NotificationCenterItem } from '../../hooks/useNotificationCenter';
import { useRespondToFriendRequest } from '../../hooks/useProfile';
import { formatRelativeTime } from '../../utils/time';
import { hrefWithReturnTo } from '../../lib/navigationReturn';

type Props = {
  visible: boolean;
  onClose: () => void;
  items: NotificationCenterItem[];
  isLoading: boolean;
  onDismissItem?: (key: string) => void | Promise<void>;
  onClearHistory?: () => void | Promise<void>;
};

export function NotificationSheet({
  visible,
  onClose,
  items,
  isLoading,
  onDismissItem,
  onClearHistory,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
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
        dismissAction: {
          justifyContent: 'center',
          alignItems: 'center',
          width: 80,
          marginBottom: Spacing.sm,
          borderRadius: Radius.md,
          backgroundColor: colors.error,
        },
        dismissActionText: {
          color: '#FFFFFF',
          fontWeight: '600',
          fontSize: 13,
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
      router.push(hrefWithReturnTo(`/(app)/member/${username}`, pathname));
    },
    [router, pathname],
  );

  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());

  const renderRightActions = useCallback(
    (key: string) => (
      <TouchableOpacity
        style={styles.dismissAction}
        onPress={() => {
          swipeableRefs.current.get(key)?.close();
          void onDismissItem?.(key);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.dismissActionText}>Dismiss</Text>
      </TouchableOpacity>
    ),
    [onDismissItem, styles.dismissAction, styles.dismissActionText],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationCenterItem }) => {
      let card: React.ReactNode;

      switch (item.kind) {
        case 'friend_request': {
          const fr = item.friendship;
          const requester = fr.requester;
          card = (
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
          break;
        }
        case 'friend_accepted': {
          const f = item.friendship;
          const addressee = f.addressee;
          card = (
            <Card style={styles.card} elevated padded={false}>
              <View style={styles.userRow}>
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
              </View>
            </Card>
          );
          break;
        }
        case 'reactions_group': {
          const shown = item.actors.slice(0, 3);
          const names = shown.map((a) => a.display_name ?? a.username ?? 'Someone').join(', ');
          const extraUsers = Math.max(0, item.actors.length - shown.length);
          const userSuffix =
            extraUsers > 0 ? ` and ${extraUsers} other${extraUsers === 1 ? '' : 's'}` : '';
          const emojiStr = item.emojis.slice(0, 5).join(' ');
          card = (
            <Card style={styles.card} elevated padded={false}>
              <View style={styles.userRow}>
                <View style={[styles.userMeta, { flex: 1 }]}>
                  <Text variant="headingMedium" style={styles.rowTitle}>
                    Reactions on your post
                  </Text>
                  <Text variant="bodySmall" color={colors.textSecondary}>
                    {names}
                    {userSuffix}
                    {emojiStr ? ` · ${emojiStr}` : ''}
                    {item.emojis.length > 5 ? '…' : ''} · {formatRelativeTime(item.sortAt)}
                  </Text>
                  <Text variant="micro" color={colors.textTertiary}>
                    {item.count} reaction{item.count === 1 ? '' : 's'}
                  </Text>
                </View>
              </View>
            </Card>
          );
          break;
        }
        case 'challenge': {
          const ue = item.userEvent;
          const title = ue.challenge?.title ?? 'Challenge';
          card = (
            <Card style={styles.card} elevated padded={false}>
              <View style={styles.userMeta}>
                <Text variant="headingMedium" style={styles.rowTitle}>
                  Challenge ready
                </Text>
                <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={2}>
                  {title} · {formatRelativeTime(item.sortAt)}
                </Text>
                <Text variant="micro" color={colors.textTertiary}>
                  Open the Home tab to start today&apos;s challenge.
                </Text>
              </View>
            </Card>
          );
          break;
        }
        default:
          return null;
      }

      return (
        <Swipeable
          ref={(ref) => { swipeableRefs.current.set(item.key, ref); }}
          renderRightActions={() => renderRightActions(item.key)}
          friction={2}
          rightThreshold={40}
          overshootRight={false}
        >
          {card}
        </Swipeable>
      );
    },
    [
      colors.textSecondary,
      colors.textTertiary,
      openProfile,
      renderRightActions,
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
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
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
          {onClearHistory ? (
            <TouchableOpacity
              onPress={() => {
                Alert.alert(
                  'Clear notification history',
                  'Remove older items from this list? Pending friend requests stay visible.',
                  [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: () => {
                        void onClearHistory();
                      },
                    },
                  ],
                );
              }}
              style={styles.footerBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear notifications"
            >
              <Text variant="bodySmall" color={colors.textTertiary}>
                Clear notifications
              </Text>
            </TouchableOpacity>
          ) : null}
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
