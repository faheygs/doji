import React, { useMemo, useCallback } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
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
import { Text } from '../ui/Text';
import { Avatar } from '../ui/Avatar';
import { IconClose } from '../icons/Icons';
import { getEquippedBorder } from '../../lib/cosmetics';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
import { useCommentLikes, type CommentLikeRow } from '../../hooks/useCommentLikes';
import { Button } from '../ui/Button';
import { useAuthStore } from '../../stores/useAuthStore';
import { useSendFriendRequest } from '../../hooks/useProfile';
import { getFriendIdsIncludingSelf } from '../../lib/friendGraph';
import { supabase } from '../../lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type Props = {
  visible: boolean;
  commentId: string;
  onClose: () => void;
};

export function CommentLikesSheet({ visible, commentId, onClose }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const winH = Dimensions.get('window').height;
  const userId = useAuthStore((s) => s.session?.user?.id);
  const sendRequest = useSendFriendRequest();
  const queryClient = useQueryClient();

  const { data: friendIds = [] } = useQuery({
    queryKey: ['friendIds', userId],
    queryFn: () => getFriendIdsIncludingSelf(userId!),
    enabled: visible && !!userId,
    staleTime: 30_000,
  });

  const { data: pendingRequests = [] } = useQuery({
    queryKey: ['pendingRequests', userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data } = await supabase
        .from('friendships')
        .select('addressee_id')
        .eq('requester_id', userId)
        .eq('status', 'pending');
      return (data ?? []).map((r) => r.addressee_id as string);
    },
    enabled: visible && !!userId,
    staleTime: 30_000,
  });

  const { data, isPending, isFetchingNextPage, fetchNextPage, hasNextPage } = useCommentLikes(
    commentId,
    visible,
  );

  const likes = useMemo(
    () => (data?.pages ?? []).flatMap((page) => page),
    [data?.pages],
  );

  const handleClose = useCallback(() => {
    Haptics.selectionAsync();
    onClose();
  }, [onClose]);

  const openProfile = useCallback(
    (username: string | undefined) => {
      if (!username) return;
      Haptics.selectionAsync();
      handleClose();
      router.push(hrefWithReturnTo(`/(app)/member/${username}`, pathname));
    },
    [handleClose, pathname, router],
  );

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, justifyContent: 'flex-end' },
        scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.25)' },
        sheet: {
          height: winH * 0.5,
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
          paddingHorizontal: Spacing.md,
          paddingBottom: Spacing.sm,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        title: { flex: 1 },
        closeHit: { padding: Spacing.xs },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: Spacing.sm,
          paddingHorizontal: Spacing.md,
          paddingVertical: Spacing.sm + 2,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.hairline,
        },
        rowBody: { flex: 1, minWidth: 0 },
        centered: { padding: Spacing.xl, alignItems: 'center' },
        footer: { paddingVertical: Spacing.sm, alignItems: 'center' },
        addBtn: { marginLeft: Spacing.xs },
      }),
    [colors, winH],
  );

  const renderItem = useCallback(
    ({ item }: { item: CommentLikeRow }) => {
      const username = item.profile?.username ?? 'unknown';
      const border = getEquippedBorder(item.profile);
      const isMe = item.user_id === userId;
      const isFriend = friendIds.includes(item.user_id);
      const isPending = pendingRequests.includes(item.user_id);
      const canAdd = !isMe && !isFriend;
      return (
        <TouchableOpacity
          style={styles.row}
          onPress={() => openProfile(item.profile?.username)}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel={`@${username}`}
        >
          <Avatar
            uri={item.profile?.avatar_url}
            username={username}
            size={40}
            borderColor={border?.color}
            borderWidth={border?.width}
          />
          <View style={styles.rowBody}>
            <Text variant="body" numberOfLines={1} style={{ fontWeight: '600' }}>
              @{username}
            </Text>
            {item.profile?.display_name ? (
              <Text variant="bodySmall" color={colors.textSecondary} numberOfLines={1}>
                {item.profile.display_name}
              </Text>
            ) : null}
          </View>
          {canAdd ? (
            <Button
              size="sm"
              variant={isPending ? 'ghost' : 'primary'}
              style={styles.addBtn}
              disabled={isPending || sendRequest.isPending}
              onPress={() => {
                if (isPending || !item.user_id) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                sendRequest.mutate(item.user_id, {
                  onSuccess: () => {
                    void queryClient.invalidateQueries({ queryKey: ['pendingRequests', userId] });
                    void queryClient.invalidateQueries({ queryKey: ['friendIds', userId] });
                  },
                });
              }}
            >
              {isPending ? 'Pending' : '+ Friend'}
            </Button>
          ) : null}
        </TouchableOpacity>
      );
    },
    [colors, friendIds, openProfile, pendingRequests, queryClient, sendRequest, styles.addBtn, styles.row, styles.rowBody, userId],
  );

  if (!visible) return null;

  const title = `Likes · ${likes.length}${hasNextPage ? '+' : ''}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={handleClose} accessibilityLabel="Dismiss" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.sm }]}>
          <View style={styles.grab} />
          <View style={styles.headRow}>
            <Text variant="headingMedium" numberOfLines={1} style={styles.title}>
              {title}
            </Text>
            <TouchableOpacity
              onPress={handleClose}
              hitSlop={12}
              style={styles.closeHit}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <IconClose size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {isPending ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.text} />
            </View>
          ) : likes.length === 0 ? (
            <View style={styles.centered}>
              <Text variant="body" color={colors.textSecondary}>
                No likes yet.
              </Text>
            </View>
          ) : (
            <FlatList
              data={likes}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
              }}
              onEndReachedThreshold={0.4}
              ListFooterComponent={
                isFetchingNextPage ? (
                  <View style={styles.footer}>
                    <ActivityIndicator color={colors.textSecondary} size="small" />
                  </View>
                ) : null
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}
