import React, { useMemo, useCallback, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  Platform,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter, usePathname } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { IconBell, IconClose, IconCheck } from '../icons/Icons';
import { AvatarStack } from '../ui/AvatarStack';
import { ReactionIconRow } from '../ui/ReactionIconRow';
import { NotificationActorRow } from './NotificationActorRow';
import { FriendActivityNotificationCard } from './FriendActivityNotificationCard';
import { NotificationListSkeleton } from './NotificationListSkeleton';
import { SkeletonSwap } from '../ui/SkeletonSwap';
import { CategoryBadgeIcon } from '../icons/BadgeIcons';
import type { NotificationCenterItem } from '../../hooks/useNotificationCenter';
import { useRespondToFriendRequest } from '../../hooks/useFriendRequests';
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
import { useDismissOnRouteBlur } from '../../hooks/useDismissOnRouteBlur';
type Props = {
  visible: boolean;
  onClose: () => void;
  items: NotificationCenterItem[];
  isLoading: boolean;
  isClearing?: boolean;
  onDismissItem?: (key: string) => void | Promise<void>;
  onClearHistory?: () => void | Promise<void>;
};
export function NotificationSheet({
  visible,
  onClose,
  items,
  isLoading,
  isClearing = false,
  onDismissItem,
  onClearHistory,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { colors } = useTheme();
  const [actionError, setActionError] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const swipeableRefs = useRef<Map<string, Swipeable | null>>(new Map());
  const respond = useRespondToFriendRequest();
  useDismissOnRouteBlur(visible, onClose);

  const dismissThen = useCallback((action: () => void) => {
    pendingActionRef.current = action;
    onClose();
  }, [onClose]);

  const finishDismiss = useCallback(() => {
    swipeableRefs.current.forEach((ref) => ref?.close());
    swipeableRefs.current.clear();
    setActionError(false);
    const action = pendingActionRef.current;
    pendingActionRef.current = null;
    if (action) requestAnimationFrame(action);
  }, []);

  React.useEffect(() => {
    if (!visible && Platform.OS !== 'ios') finishDismiss();
  }, [finishDismiss, visible]);

  const openFeedPost = useCallback(
    (postId: string, openComments = false, mentionCommentId?: string) => {
      Haptics.selectionAsync();
      dismissThen(() => navigateToFeedPost(router, postId, { openComments, mentionCommentId }));
    },
    [dismissThen, router],
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
      dismissThen(() => router.push(hrefWithReturnTo(`/(app)/member/${handle}`, pathname)));
    },
    [dismissThen, router, pathname],
  );
  const clearAll = useCallback(async () => {
    setActionError(false);
    try { await onClearHistory?.(); } catch { setActionError(true); }
  }, [onClearHistory]);

  const renderRightActions = useCallback(
    (key: string) => (
      <TouchableOpacity
        style={styles.dismissAction}
        onPress={async () => {
          swipeableRefs.current.get(key)?.close();
          setActionError(false);
          try { await onDismissItem?.(key); } catch { setActionError(true); }
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
        case 'comment_like': {
          const copy = {
            title: notificationActorName(item.actor),
            body: 'Liked your comment',
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
                  <AvatarStack
                    users={shown.map((a) => ({
                      avatar_url: a.avatar_url,
                      username: a.username ?? undefined,
                      equipped_border_key: a.equipped_border_key,
                    }))}
                    size={36}
                    max={3}
                    borderColor={colors.surface}
                  />
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
        case 'friend_activity_group': {
          card = (
            <FriendActivityNotificationCard
              item={item}
              onPress={() => {
                Haptics.selectionAsync();
                dismissThen(() => safeReplace(router, ROUTES.feed));
              }}
            />
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
                    <CategoryBadgeIcon categoryId={item.categoryId} size={22} color={colors.primary} />
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
                onPress={() => { Haptics.selectionAsync(); dismissThen(() => safeReplace(router, ROUTES.feed)); }}
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
      dismissThen,
      router,
      renderRightActions,
      respond,
      styles.actions,
      styles.card,
      styles.challengeLeading,
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
      onDismiss={finishDismiss}
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

        <SkeletonSwap
          loading={visible && isLoading && items.length === 0}
          skeleton={<NotificationListSkeleton />}
        >
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
        </SkeletonSwap>

        <View style={styles.footer}>
          {actionError ? <Text variant="micro" color={colors.error} style={{ textAlign: 'center' }}>Couldn&apos;t update notifications. Try again.</Text> : null}
          {onClearHistory && items.some((item) => item.kind !== 'friend_request') ? (
            <Button onPress={() => void clearAll()} variant="ghost" size="sm" loading={isClearing} fullWidth>
              Clear notifications
            </Button>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
