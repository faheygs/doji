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
import { IconBell, IconClose } from '../icons/Icons';
import { AvatarStack } from '../ui/AvatarStack';
import { ReactionIconRow } from '../ui/ReactionIconRow';
import type { NotificationCenterItem } from '../../hooks/useNotificationCenter';
import { useRespondToFollowRequest } from '../../hooks/useFollows';
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
  const respond = useRespondToFollowRequest();

  useEffect(() => {
    if (!visible) return;
    queryClient.invalidateQueries({ queryKey: ['followRequests'] });
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
        reactionMeta: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          marginTop: 2,
        },
        reactionCount: {
          marginTop: 2,
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
          color: colors.onPrimary,
          fontWeight: '600',
          fontSize: 13,
        },
      }),
    [colors],
  );

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
        case 'follow_request': {
          const fr = item.follow;
          const requester = fr.follower;
          card = (
            <Card style={styles.card} elevated padded={false}>
              <TouchableOpacity
                onPress={() => openProfile(requester?.username)}
                style={styles.userRow}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={`Follow request from ${requester?.username ?? 'user'}`}
              >
                <Avatar uri={requester?.avatar_url} username={requester?.username} size={44} />
                <View style={styles.userMeta}>
                  <Text variant="headingMedium">{requester?.display_name ?? 'Someone'}</Text>
                  <Text variant="bodySmall" color={colors.textSecondary}>
                    @{requester?.username ?? '…'} wants to follow you ·{' '}
                    {formatRelativeTime(fr.created_at)}
                  </Text>
                </View>
              </TouchableOpacity>
              <View style={styles.actions}>
                <Button
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    respond.mutate({ followId: fr.id, accept: true });
                  }}
                  size="sm"
                  loading={respond.isPending}
                >
                  Accept
                </Button>
                <Button
                  onPress={() => respond.mutate({ followId: fr.id, accept: false })}
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
        case 'follow_accepted': {
          const f = item.follow;
          const following = f.following;
          card = (
            <Card style={styles.card} elevated padded={false}>
              <TouchableOpacity
                onPress={() => openProfile(following?.username)}
                style={styles.userRow}
                activeOpacity={0.85}
              >
                <Avatar uri={following?.avatar_url} username={following?.username} size={44} />
                <View style={styles.userMeta}>
                  <Text variant="headingMedium" style={styles.rowTitle}>
                    Follow accepted
                  </Text>
                  <Text variant="bodySmall" color={colors.textSecondary}>
                    @{following?.username ?? '…'} accepted your follow ·{' '}
                    {formatRelativeTime(item.sortAt)}
                  </Text>
                </View>
              </TouchableOpacity>
            </Card>
          );
          break;
        }
        case 'reactions_group': {
          const shown = item.actors.slice(0, 3);
          const primary = shown[0];
          const extraUsers = Math.max(0, item.actors.length - 1);
          const nameLine =
            extraUsers === 0
              ? `@${primary?.username ?? 'someone'}`
              : extraUsers === 1
                ? `@${primary?.username ?? 'someone'} and 1 other`
                : `@${primary?.username ?? 'someone'} and ${extraUsers} others`;
          card = (
            <Card style={styles.card} elevated padded={false}>
              <View style={styles.userRow}>
                <AvatarStack
                  users={shown.map((a) => ({
                    avatar_url: a.avatar_url,
                    username: a.username,
                  }))}
                  size={40}
                  max={3}
                  borderColor={colors.background}
                />
                <View style={[styles.userMeta, { flex: 1 }]}>
                  <Text variant="headingMedium" style={styles.rowTitle}>
                    Reactions on your post
                  </Text>
                  <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={2}>
                    {nameLine}
                  </Text>
                  <View style={styles.reactionMeta}>
                    <ReactionIconRow emojis={item.emojis} colors={colors} size={15} />
                    <Text variant="micro" color={colors.textTertiary}>
                      · {formatRelativeTime(item.sortAt)}
                    </Text>
                  </View>
                  <Text variant="micro" color={colors.textTertiary} style={styles.reactionCount}>
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
      colors.background,
      openProfile,
      renderRightActions,
      respond,
      styles.actions,
      styles.card,
      styles.rowTitle,
      styles.userMeta,
      styles.userRow,
      styles.reactionMeta,
      styles.reactionCount,
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
                  'Remove older items from this list? Pending follow requests stay visible.',
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
        </View>
      </View>
    </Modal>
  );
}
