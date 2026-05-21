import React, { useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  ListRenderItem,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Spacing, Radius } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import type { AppColors } from '../../constants/theme';
import { Avatar } from '../ui/Avatar';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { IconClose } from '../icons/Icons';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
import { useAuthStore } from '../../stores/useAuthStore';
import {
  useFriendshipsBulkWithTargets,
  useProfileFriendsList,
  useRespondToFriendRequest,
  useSendFriendRequest,
  type ProfileFriendListRow,
} from '../../hooks/useProfile';
import type { Friendship } from '../../types/database';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Profile whose friends we list */
  profileUserId: string;
  ownerDisplayName?: string | null;
};

export function ProfileFriendsSheet({ visible, onClose, profileUserId, ownerDisplayName }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const viewerId = useAuthStore((s) => s.session?.user?.id);

  const { data: rows = [], isPending: rowsPending } = useProfileFriendsList(profileUserId, visible);

  const targetIds = useMemo(() => rows.map((r) => r.friend_id), [rows]);

  const { data: relationByOther = {}, isPending: relationPending } = useFriendshipsBulkWithTargets(
    visible ? targetIds : [],
  );

  const sendFriendRequest = useSendFriendRequest();
  const respondRequest = useRespondToFriendRequest();

  const graphLoading =
    !!(visible && targetIds.length > 0 && relationPending);

  const winH = Dimensions.get('window').height;

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          justifyContent: 'flex-end',
        },
        scrim: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: colors.overlayBackdrop,
        },
        sheet: {
          maxHeight: winH * 0.92,
          minHeight: 220,
          backgroundColor: colors.surface,
          borderTopLeftRadius: Radius.lg,
          borderTopRightRadius: Radius.lg,
          paddingTop: Spacing.sm,
          borderWidth: StyleSheet.hairlineWidth,
          borderBottomWidth: 0,
          borderColor: colors.border,
        },
        grab: {
          alignSelf: 'center',
          width: 42,
          height: 5,
          borderRadius: 3,
          backgroundColor: colors.textTertiary,
          opacity: 0.4,
          marginBottom: Spacing.sm,
        },
        headRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.sm,
        },
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.hairline,
          marginHorizontal: Spacing.md,
        },
        list: {
          paddingHorizontal: Spacing.md,
          paddingTop: Spacing.xs,
          paddingBottom: Spacing.sm,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingVertical: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        rowMain: {
          flex: 1,
          minWidth: 0,
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
        },
        rowTexts: {
          flex: 1,
          minWidth: 0,
          gap: 2,
        },
        actionSlot: {
          minWidth: 102,
          alignItems: 'flex-end',
          justifyContent: 'center',
        },
        mutedPill: {
          paddingHorizontal: Spacing.sm,
          paddingVertical: 6,
          borderRadius: Radius.sm,
          backgroundColor: colors.fillMuted,
        },
        centered: {
          paddingVertical: Spacing.xl,
          alignItems: 'center',
          justifyContent: 'center',
        },
      }),
    [colors, winH],
  );

  const awaitingRows = rowsPending;

  const openProfile = useCallback(
    (username: string) => {
      onClose();
      router.push(hrefWithReturnTo(`/(app)/member/${username}`, pathname));
    },
    [onClose, pathname, router],
  );

  const mutationBusy = sendFriendRequest.isPending || respondRequest.isPending;

  const renderRow: ListRenderItem<ProfileFriendListRow> = useCallback(
    ({ item }) => (
      <ProfileFriendsSheetRow
        item={item}
        viewerId={viewerId ?? ''}
        rel={relationByOther[item.friend_id]}
        colors={colors}
        styles={styles}
        graphLoading={graphLoading}
        mutationBusy={mutationBusy}
        onNavigate={() => openProfile(item.username)}
        onAddFriend={() => sendFriendRequest.mutate(item.friend_id)}
        onAcceptRequest={(friendshipId) =>
          respondRequest.mutate({ friendshipId: friendshipId, accept: true })
        }
      />
    ),
    [
      colors,
      graphLoading,
      mutationBusy,
      openProfile,
      relationByOther,
      respondRequest,
      sendFriendRequest,
      viewerId,
      styles,
    ],
  );

  const titleSuffix = ownerDisplayName?.trim()
    ? `${ownerDisplayName.trim()}'s friends`
    : 'Friends';

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <View style={styles.grab} />
          <View style={styles.headRow}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: Spacing.sm }}>
              <Text variant="headingMedium" numberOfLines={1}>
                Friends
              </Text>
              <Text variant="micro" color={colors.textTertiary} numberOfLines={2}>
                {titleSuffix}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                onClose();
              }}
              hitSlop={14}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <IconClose size={26} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <View style={styles.divider} />
          {awaitingRows && rows.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.text} />
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.centered}>
              <Text variant="body" color={colors.textSecondary}>
                No friends to show yet.
              </Text>
            </View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.friend_id}
              renderItem={renderRow}
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={14}
              windowSize={6}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

type RowStyles = {
  row: import('react-native').ViewStyle;
  rowMain: import('react-native').ViewStyle;
  rowTexts: import('react-native').ViewStyle;
  actionSlot: import('react-native').ViewStyle;
  mutedPill: import('react-native').ViewStyle;
};

function ProfileFriendsSheetRow({
  item,
  viewerId,
  rel,
  colors,
  styles,
  graphLoading,
  mutationBusy,
  onNavigate,
  onAddFriend,
  onAcceptRequest,
}: {
  item: ProfileFriendListRow;
  viewerId: string;
  rel: Friendship | undefined;
  colors: AppColors;
  styles: RowStyles;
  graphLoading: boolean;
  mutationBusy: boolean;
  onNavigate: () => void;
  onAddFriend: () => void;
  onAcceptRequest: (friendshipId: string) => void;
}) {
  const isSelf = viewerId !== '' && item.friend_id === viewerId;

  let actionSlot: React.ReactNode;
  if (graphLoading) {
    actionSlot = <ActivityIndicator color={colors.text} size="small" />;
  } else if (!viewerId || isSelf) {
    actionSlot = (
      <Text variant="micro" color={colors.textTertiary}>
        You
      </Text>
    );
  } else if (!rel) {
    actionSlot = (
      <Button variant="primary" size="sm" disabled={mutationBusy} onPress={onAddFriend}>
        Add friend
      </Button>
    );
  } else if (rel.status === 'blocked') {
    actionSlot = (
      <View style={styles.mutedPill}>
        <Text variant="label" color={colors.textTertiary}>
          Unavailable
        </Text>
      </View>
    );
  } else if (rel.status === 'accepted') {
    actionSlot = (
      <View style={styles.mutedPill}>
        <Text variant="label" color={colors.textSecondary}>
          Friends
        </Text>
      </View>
    );
  } else if (rel.status === 'pending' && rel.requester_id === viewerId) {
    actionSlot = (
      <View style={styles.mutedPill}>
        <Text variant="label" color={colors.textTertiary}>
          Sent
        </Text>
      </View>
    );
  } else if (rel.status === 'pending' && rel.addressee_id === viewerId) {
    actionSlot = (
      <Button
        variant="secondary"
        size="sm"
        disabled={mutationBusy}
        onPress={() => onAcceptRequest(rel.id)}
      >
        Accept
      </Button>
    );
  } else {
    actionSlot = (
      <Button variant="primary" size="sm" disabled={mutationBusy} onPress={onAddFriend}>
        Add friend
      </Button>
    );
  }

  return (
    <View style={styles.row}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel={`Open profile ${item.username}`}
        onPress={() => {
          Haptics.selectionAsync();
          onNavigate();
        }}
        style={styles.rowMain}
      >
        <Avatar uri={item.avatar_url ?? undefined} username={item.username} size={46} />
        <View style={styles.rowTexts}>
          <Text variant="body" style={{ fontWeight: '700' }} numberOfLines={1}>
            {item.display_name}
          </Text>
          <Text variant="micro" color={colors.textSecondary} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>
      </TouchableOpacity>
      <View style={styles.actionSlot}>{actionSlot}</View>
    </View>
  );
}
