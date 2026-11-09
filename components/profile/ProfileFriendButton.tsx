import { View, StyleSheet } from 'react-native';
import { Button } from '../ui/Button';
import { IconPlus } from '../icons/Icons';
import { useTheme } from '../../contexts/ThemeContext';
import { Spacing } from '../../constants/theme';
import type { ViewerFriendshipStatus } from '../../hooks/useProfile';

export function ProfileFriendButton({
  ready,
  blocked,
  status,
  busy,
  onPress,
}: {
  ready: boolean;
  blocked: boolean;
  status?: ViewerFriendshipStatus;
  busy: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  if (!ready)
    return (
      <View
        style={[styles.button, { backgroundColor: colors.surfaceMuted }]}
        accessibilityLabel="Loading friendship status"
        accessibilityState={{ busy: true }}
      />
    );
  if (blocked) return null;
  const friend = status === 'friends',
    outgoing = status === 'pending_out';
  return (
    <Button
      onPress={onPress}
      variant={friend || outgoing ? 'secondary' : 'primary'}
      size="sm"
      loading={busy}
      disabled={busy || outgoing || status === 'blocked'}
      style={styles.button}
      leftIcon={!friend && !outgoing ? <IconPlus size={15} color={colors.onPrimary} /> : undefined}
    >
      {friend
        ? 'Unfriend'
        : outgoing
          ? 'Requested'
          : status === 'pending_in'
            ? 'Accept'
            : 'Add friend'}
    </Button>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 44, minWidth: 112, paddingHorizontal: Spacing.md },
});
