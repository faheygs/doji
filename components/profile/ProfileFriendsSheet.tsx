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
import type { AppColors } from '../../constants/theme';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Text } from '../ui/Text';
import { IconClose } from '../icons/Icons';
import { hrefWithReturnTo } from '../../lib/navigationReturn';
import { useProfileFriendsPaged } from '../../hooks/useProfileFriendsPaged';
import { useDismissOnRouteBlur } from '../../hooks/useDismissOnRouteBlur';

type Props = {
  visible: boolean;
  onClose: () => void;
  profileUserId: string;
  ownerDisplayName?: string | null;
};

const SHEET_HEIGHT_RATIO = 0.5;

export function ProfileFriendsSheet({
  visible,
  onClose,
  profileUserId,
  ownerDisplayName,
}: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  useDismissOnRouteBlur(visible, onClose);

  const friendsQuery = useProfileFriendsPaged(profileUserId, visible);
  const friends = useMemo(
    () => friendsQuery.data?.pages.flat() ?? [],
    [friendsQuery.data?.pages],
  );
  const { isPending, fetchNextPage, hasNextPage, isFetchingNextPage } = friendsQuery;

  const winH = Dimensions.get('window').height;
  const sheetHeight = winH * SHEET_HEIGHT_RATIO;

  const styles = useMemo(() => createStyles(colors, insets.bottom, sheetHeight), [colors, insets.bottom, sheetHeight]);

  const openMember = useCallback(
    (username: string) => {
      Haptics.selectionAsync();
      onClose();
      router.push(hrefWithReturnTo(`/(app)/member/${username}`, pathname));
    },
    [onClose, pathname, router],
  );

  if (!visible) return null;

  return (
    <Modal visible animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text variant="headingMedium" numberOfLines={1} style={{ flex: 1 }}>
              {ownerDisplayName ? `${ownerDisplayName}'s friends` : 'Friends'}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <IconClose size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {isPending && friends.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.text} />
            </View>
          ) : (
            <FlatList
              data={friends}
              keyExtractor={(row) => row.friend_id}
              contentContainerStyle={styles.list}
              keyboardDismissMode="on-drag"
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
              }}
              onEndReachedThreshold={0.35}
              ListFooterComponent={
                isFetchingNextPage ? <ActivityIndicator color={colors.textSecondary} /> : null
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => openMember(item.username)}
                  activeOpacity={0.8}
                >
                  <ProfileAvatar profile={item} size={44} />
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="headingMedium">{item.display_name}</Text>
                    <Text variant="bodySmall" color={colors.textSecondary}>
                      @{item.username}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.centered}>
                  <Text variant="body" color={colors.textSecondary}>
                    No friends yet
                  </Text>
                </View>
              }
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: AppColors, bottomInset: number, sheetHeight: number) {
  return StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    scrim: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: 'rgba(0,0,0,0.25)',
    },
    sheet: {
      height: sheetHeight,
      backgroundColor: colors.background,
      borderTopLeftRadius: Radius.xl,
      borderTopRightRadius: Radius.xl,
      paddingBottom: bottomInset + Spacing.md,
    },
    handle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginTop: Spacing.sm,
      marginBottom: Spacing.sm,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: Spacing.lg,
      paddingBottom: Spacing.sm,
      gap: Spacing.sm,
    },
    list: {
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.lg,
      gap: Spacing.xs,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingVertical: Spacing.sm,
      paddingHorizontal: Spacing.sm,
      borderRadius: Radius.md,
    },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: Spacing.xl,
    },
  });
}
