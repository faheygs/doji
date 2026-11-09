import { StyleSheet } from 'react-native';
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
  error = false,
  onPress,
}: {
  ready: boolean;
  blocked: boolean;
  status?: ViewerFriendshipStatus;
  busy: boolean;
  error?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  if (ready && blocked) return null;
  const friend = status === 'friends',
    outgoing = status === 'pending_out';
  return (
    <Button
      onPress={onPress}
      variant={!ready || friend || outgoing ? 'secondary' : 'primary'}
      size="sm"
      loading={busy || (!ready && !error)}
      disabled={!ready || error || busy || outgoing || status === 'blocked'}
      accessibilityLabel={
        !ready ? (error ? 'Friendship status unavailable' : 'Loading friendship status') : undefined
      }
      style={styles.button}
      leftIcon={
        ready && !friend && !outgoing ? <IconPlus size={15} color={colors.onPrimary} /> : undefined
      }
    >
      {!ready
        ? 'Unavailable'
        : friend
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
