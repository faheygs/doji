import React, { useMemo } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Spacing } from '../../constants/theme';
import { useTheme } from '../../contexts/ThemeContext';
import { useSendFriendRequest, type SearchProfile } from '../../hooks/useProfile';
import { IconCheck } from '../icons/Icons';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { ProfileAvatar } from '../ui/ProfileAvatar';
import { Text } from '../ui/Text';

export function UserSearchResult({
  user,
  onOpen,
}: {
  user: SearchProfile;
  onOpen: (user: SearchProfile) => void;
}) {
  const { colors } = useTheme();
  const sendRequest = useSendFriendRequest();
  const friendshipStatus = user.friendship_status;
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
        identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
        names: { gap: 2 },
        status: { flexDirection: 'row', alignItems: 'center', gap: 6 },
      }),
    [],
  );
  const isFriend = friendshipStatus === 'friends';
  const isRequested = friendshipStatus === 'pending_out';
  const isPendingIn = friendshipStatus === 'pending_in';

  return (
    <Card style={styles.card} elevated>
      <TouchableOpacity
        onPress={() => {
          Haptics.selectionAsync();
          onOpen(user);
        }}
        style={styles.identity}
        activeOpacity={0.8}
      >
        <ProfileAvatar profile={user} size={44} />
        <View style={styles.names}>
          <Text variant="headingMedium">{user.display_name}</Text>
          <Text variant="bodySmall" color={colors.textSecondary}>@{user.username}</Text>
        </View>
      </TouchableOpacity>
      {isFriend ? (
        <View style={styles.status}>
          <IconCheck size={16} color={colors.success} />
          <Text variant="label" color={colors.success}>Friends</Text>
        </View>
      ) : isRequested ? (
        <Text variant="label" color={colors.textSecondary}>Requested</Text>
      ) : isPendingIn ? (
        <Text variant="label" color={colors.textSecondary}>Requested you</Text>
      ) : friendshipStatus === 'blocked' ? (
        <Text variant="label" color={colors.textTertiary}>Unavailable</Text>
      ) : (
        <Button
          onPress={() => sendRequest.mutate({ addresseeId: user.id })}
          loading={sendRequest.isPending}
          size="sm"
        >
          Add friend
        </Button>
      )}
    </Card>
  );
}
