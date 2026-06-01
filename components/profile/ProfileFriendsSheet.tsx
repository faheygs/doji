import React, { useMemo, useCallback, useState, useEffect } from 'react';
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
  useFollowStatusesBulkWithTargets,
  useFollowers,
  useFollowing,
  useRespondToFollowRequest,
  useFollow,
  type FollowWithProfile,
  type FollowRelation,
} from '../../hooks/useFollows';

export type FollowListTab = 'followers' | 'following';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Profile whose follow graph we show */
  profileUserId: string;
  ownerDisplayName?: string | null;
  initialTab?: FollowListTab;
};

const SHEET_HEIGHT_RATIO = 0.72;

export function ProfileFriendsSheet({
  visible,
  onClose,
  profileUserId,
  ownerDisplayName,
  initialTab = 'following',
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const viewerId = useAuthStore((s) => s.session?.user?.id);
  const [tab, setTab] = useState<FollowListTab>(initialTab);

  useEffect(() => {
    if (visible) setTab(initialTab);
  }, [visible, initialTab]);

  const { data: followers = [], isPending: followersPending } = useFollowers(
    profileUserId,
    visible && tab === 'followers',
  );
  const { data: following = [], isPending: followingPending } = useFollowing(
    profileUserId,
    visible && tab === 'following',
  );

  const rows = tab === 'followers' ? followers : following;
  const rowsPending = tab === 'followers' ? followersPending : followingPending;

  const targetIds = useMemo(() => rows.map((r) => r.id), [rows]);

  const { data: relationByOther = {}, isPending: relationPending } = useFollowStatusesBulkWithTargets(
    visible ? targetIds : [],
  );

  const follow = useFollow();
  const respondRequest = useRespondToFollowRequest();

  const graphLoading = !!(visible && targetIds.length > 0 && relationPending);

  const winH = Dimensions.get('window').height;
  const sheetHeight = winH * SHEET_HEIGHT_RATIO;

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
          height: sheetHeight,
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
        tabRow: {
          flexDirection: 'row',
          marginHorizontal: Spacing.md,
          marginBottom: Spacing.sm,
          padding: 3,
          borderRadius: Radius.full,
          backgroundColor: colors.fillMuted,
          gap: 3,
        },
        tabBtn: {
          flex: 1,
          paddingVertical: 8,
          borderRadius: Radius.full,
          alignItems: 'center',
        },
        divider: {
          height: StyleSheet.hairlineWidth,
          backgroundColor: colors.hairline,
          marginHorizontal: Spacing.md,
        },
        list: {
          flex: 1,
          paddingHorizontal: Spacing.md,
        },
        listContent: {
          paddingTop: Spacing.xs,
          paddingBottom: Spacing.sm,
          flexGrow: 1,
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
          flex: 1,
          minHeight: 120,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: Spacing.lg,
        },
      }),
    [colors, sheetHeight],
  );

  const awaitingRows = !!(visible && rowsPending && rows.length === 0);

  const openProfile = useCallback(
    (username: string) => {
      onClose();
      router.push(hrefWithReturnTo(`/(app)/member/${username}`, pathname));
    },
    [onClose, pathname, router],
  );

  const mutationBusy = follow.isPending || respondRequest.isPending;

  const renderRow: ListRenderItem<FollowWithProfile> = useCallback(
    ({ item }) => (
      <ProfileFriendsSheetRow
        item={item}
        viewerId={viewerId ?? ''}
        rel={relationByOther[item.id]}
        colors={colors}
        styles={styles}
        graphLoading={graphLoading}
        mutationBusy={mutationBusy}
        onNavigate={() => openProfile(item.username)}
        onFollow={() => follow.mutate(item.id)}
        onAcceptRequest={(followId) => respondRequest.mutate({ followId, accept: true })}
      />
    ),
    [
      colors,
      graphLoading,
      mutationBusy,
      openProfile,
      relationByOther,
      respondRequest,
      follow,
      viewerId,
      styles,
    ],
  );

  const ownerLabel = ownerDisplayName?.trim() || 'This user';
  const emptyCopy =
    tab === 'followers' ? `${ownerLabel} has no followers yet.` : `${ownerLabel} is not following anyone yet.`;

  const listEmpty = useMemo(() => {
    if (awaitingRows) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
        </View>
      );
    }
    return (
      <View style={styles.centered}>
        <Text variant="body" color={colors.textSecondary} style={{ textAlign: 'center' }}>
          {emptyCopy}
        </Text>
      </View>
    );
  }, [awaitingRows, colors.text, emptyCopy, styles.centered]);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, Spacing.md) }]}>
          <View style={styles.grab} />
          <View style={styles.headRow}>
            <View style={{ flex: 1, minWidth: 0, paddingRight: Spacing.sm }}>
              <Text variant="headingMedium" numberOfLines={1}>
                {ownerLabel}
              </Text>
              <Text variant="micro" color={colors.textTertiary} numberOfLines={1}>
                Followers & following
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

          <View style={styles.tabRow}>
            {(['followers', 'following'] as const).map((key) => {
              const active = tab === key;
              return (
                <TouchableOpacity
                  key={key}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setTab(key);
                  }}
                  style={[
                    styles.tabBtn,
                    active && { backgroundColor: colors.surfaceElevated },
                  ]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                >
                  <Text
                    variant="label"
                    color={active ? colors.text : colors.textTertiary}
                    style={{ fontWeight: active ? '700' : '600' }}
                  >
                    {key === 'followers' ? 'Followers' : 'Following'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.divider} />
          <FlatList
            data={visible ? rows : []}
            keyExtractor={(r) => r.id}
            renderItem={renderRow}
            style={styles.list}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={listEmpty}
            keyboardShouldPersistTaps="handled"
            initialNumToRender={14}
            windowSize={6}
          />
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
  onFollow,
  onAcceptRequest,
}: {
  item: FollowWithProfile;
  viewerId: string;
  rel: FollowRelation | undefined;
  colors: AppColors;
  styles: RowStyles;
  graphLoading: boolean;
  mutationBusy: boolean;
  onNavigate: () => void;
  onFollow: () => void;
  onAcceptRequest: (followId: string) => void;
}) {
  const isSelf = viewerId !== '' && item.id === viewerId;
  const status = rel?.status ?? 'none';

  let actionSlot: React.ReactNode;
  if (graphLoading) {
    actionSlot = <ActivityIndicator color={colors.text} size="small" />;
  } else if (!viewerId || isSelf) {
    actionSlot = (
      <Text variant="micro" color={colors.textTertiary}>
        You
      </Text>
    );
  } else if (status === 'blocked') {
    actionSlot = (
      <View style={styles.mutedPill}>
        <Text variant="label" color={colors.textTertiary}>
          Unavailable
        </Text>
      </View>
    );
  } else if (status === 'following') {
    actionSlot = (
      <View style={styles.mutedPill}>
        <Text variant="label" color={colors.textSecondary}>
          Following
        </Text>
      </View>
    );
  } else if (status === 'pending_out') {
    actionSlot = (
      <View style={styles.mutedPill}>
        <Text variant="label" color={colors.textTertiary}>
          Requested
        </Text>
      </View>
    );
  } else if (status === 'pending_in' && rel?.incoming?.id) {
    actionSlot = (
      <Button
        variant="secondary"
        size="sm"
        disabled={mutationBusy}
        onPress={() => onAcceptRequest(rel.incoming!.id)}
      >
        Accept
      </Button>
    );
  } else {
    actionSlot = (
      <Button variant="primary" size="sm" disabled={mutationBusy} onPress={onFollow}>
        Follow
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
