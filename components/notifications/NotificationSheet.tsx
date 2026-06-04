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
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconBell, IconClose, IconCheck } from '../icons/Icons';
import { AvatarStack } from '../ui/AvatarStack';
import { ReactionIconRow } from '../ui/ReactionIconRow';
import { NotificationActorRow } from './NotificationActorRow';
import type { NotificationCenterItem } from '../../hooks/useNotificationCenter';
import { useRespondToFriendRequest } from '../../hooks/useProfile';
import {
  friendRequestCopy,
  friendAcceptedCopy,
  reactionActorsLine,
  challengeCopy,
  notificationActorName,
  notificationActorHandle,
} from '../../lib/notificationCopy';
import { navigateToFeedPost, ROUTES, safeReplace } from '../../lib/routes';
import { normalizeUsernameInput } from '../../hooks/useUsernameAvailability';
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

  const openFeedPost = useCallback(
    (postId: string, openComments = false, mentionCommentId?: string) => {
      Haptics.selectionAsync();
      onClose();
      navigateToFeedPost(router, postId, { openComments, mentionCommentId });
    },
    [onClose, router],
  );

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
        },
        actions: {
          flexDirection: 'row',
          gap: Spacing.sm,
        },
        reactionLeading: {
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        },
        challengeLeading: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.primaryLight,
          alignItems: 'center',
          justifyContent: 'center',
        },
        badgeLeading: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.primaryPale,
          alignItems: 'center',
          justifyContent: 'center',
        },
        suggestionApprovedLeading: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.successLight,
          alignItems: 'center',
          justifyContent: 'center',
        },
        suggestionRejectedLeading: {
          width: 44,
          height: 44,
          borderRadius: 22,
          backgroundColor: colors.chipBackground,
          alignItems: 'center',
          justifyContent: 'center',
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
      const handle = username ? normalizeUsernameInput(username) : '';
      if (!handle) return;
      Haptics.selectionAsync();
      router.push(hrefWithReturnTo(`/(app)/member/${handle}`, pathname));
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
          const requester = item.friendship.requester;
          const copy = friendRequestCopy(requester);
          card = (
            <Card style={styles.card} elevated padded={false}>
              {/* No onPress on the row — the footer buttons are the only actions.
                  Having both an outer TouchableOpacity and inner buttons causes
                  openProfile() to fire when Accept is tapped, which navigates
                  away and closes the sheet. */}
              <NotificationActorRow
                actor={requester}
                title={copy.title}
                body={copy.body}
                sortAt={item.sortAt}
                footer={
                  <View style={styles.actions}>
                    <Button
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        respond.mutate({ friendshipId: item.friendship.id, accept: true });
                      }}
                      size="sm"
                      loading={respond.isPending}
                    >
                      Accept
                    </Button>
                    <Button
                      onPress={() =>
                        respond.mutate({ friendshipId: item.friendship.id, accept: false })
                      }
                      size="sm"
                      variant="ghost"
                      loading={respond.isPending}
                    >
                      Decline
                    </Button>
                  </View>
                }
              />
            </Card>
          );
          break;
        }
        case 'friend_accepted': {
          const addressee = item.friendship.addressee;
          const copy = friendAcceptedCopy(addressee);
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                actor={addressee}
                title={copy.title}
                body={copy.body}
                sortAt={item.sortAt}
                onPress={() => openProfile(notificationActorHandle(addressee))}
              />
            </Card>
          );
          break;
        }
        case 'comment': {
          const copy = {
            title: notificationActorName(item.actor),
            body: 'Commented on your post',
          };
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                actor={item.actor ?? undefined}
                title={copy.title}
                body={copy.body}
                sortAt={item.sortAt}
                onPress={() => openFeedPost(item.post_id, true, item.comment_id)}
              />
            </Card>
          );
          break;
        }
        case 'mention': {
          const copy = {
            title: notificationActorName(item.actor),
            body: 'Mentioned you in a comment',
          };
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                actor={item.actor ?? undefined}
                title={copy.title}
                body={copy.body}
                sortAt={item.sortAt}
                onPress={() => openFeedPost(item.post_id, true, item.comment_id)}
              />
            </Card>
          );
          break;
        }
        case 'reactions_group': {
          const shown = item.actors.slice(0, 3);
          const copy = reactionActorsLine(item.actors);
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                title={copy.title}
                body={copy.body}
                sortAt={item.sortAt}
                onPress={() => openFeedPost(item.post_id)}
                leading={
                  <View style={styles.reactionLeading}>
                    <AvatarStack
                      users={shown.map((a) => ({
                        avatar_url: a.avatar_url,
                        username: a.username ?? undefined,
                      }))}
                      size={40}
                      max={3}
                      borderColor={colors.background}
                    />
                  </View>
                }
                footer={
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                    <ReactionIconRow emojis={item.emojis} colors={colors} size={15} />
                    <Text variant="micro" color={colors.textTertiary}>
                      {item.count} reaction{item.count === 1 ? '' : 's'}
                    </Text>
                  </View>
                }
              />
            </Card>
          );
          break;
        }
        case 'challenge': {
          const copy = challengeCopy(item.userEvent.challenge?.title);
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                title={copy.title}
                body={copy.body}
                sortAt={item.sortAt}
                leading={
                  <View style={styles.challengeLeading}>
                    <IconBell size={22} color={colors.primary} />
                  </View>
                }
              />
            </Card>
          );
          break;
        }
        case 'badge_earned': {
          const tierLabel = item.tier.charAt(0).toUpperCase() + item.tier.slice(1);
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                title="Badge unlocked!"
                body={`${item.categoryName} — ${tierLabel}`}
                sortAt={item.sortAt}
                leading={
                  <View style={styles.badgeLeading}>
                    {item.categoryEmoji ? (
                      <Text style={{ fontSize: 22 }}>{item.categoryEmoji}</Text>
                    ) : (
                      <IconBell size={22} color={colors.primary} />
                    )}
                  </View>
                }
              />
            </Card>
          );
          break;
        }
        case 'suggestion_result': {
          const approved = item.status === 'approved';
          const truncated =
            item.body.length > 60 ? `${item.body.slice(0, 60).trimEnd()}…` : item.body;
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                title={approved ? 'Challenge suggestion approved!' : 'Challenge suggestion reviewed'}
                body={truncated}
                sortAt={item.sortAt}
                leading={
                  <View
                    style={
                      approved
                        ? styles.suggestionApprovedLeading
                        : styles.suggestionRejectedLeading
                    }
                  >
                    <IconCheck
                      size={22}
                      color={approved ? colors.success : colors.textSecondary}
                    />
                  </View>
                }
              />
            </Card>
          );
          break;
        }
        case 'comment_reply': {
          const copy = {
            title: notificationActorName(item.actor),
            body: 'Replied to your comment',
          };
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                actor={item.actor ?? undefined}
                title={copy.title}
                body={copy.body}
                sortAt={item.sortAt}
                onPress={() => openFeedPost(item.post_id, true, item.comment_id)}
              />
            </Card>
          );
          break;
        }
        case 'poll_vote': {
          const copy = {
            title: notificationActorName(item.actor),
            body: "Voted on today's poll",
          };
          card = (
            <Card style={styles.card} elevated padded={false}>
              <NotificationActorRow
                actor={item.actor ?? undefined}
                title={copy.title}
                body={copy.body}
                sortAt={item.sortAt}
                onPress={() => { Haptics.selectionAsync(); onClose(); safeReplace(router, ROUTES.feed); }}
              />
            </Card>
          );
          break;
        }
        default:
          return null;
      }

      return (
        <Swipeable
          ref={(ref) => {
            swipeableRefs.current.set(item.key, ref);
          }}
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
      colors,
      openProfile,
      openFeedPost,
      onClose,
      router,
      renderRightActions,
      respond,
      styles.actions,
      styles.card,
      styles.challengeLeading,
      styles.reactionLeading,
      styles.badgeLeading,
      styles.suggestionApprovedLeading,
      styles.suggestionRejectedLeading,
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
                  Friend requests, reactions, badge unlocks, and today&apos;s challenge show up here.
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
        </View>
      </View>
    </Modal>
  );
}
