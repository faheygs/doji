import { useRef } from 'react';
import { View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Spacing } from '../../constants/theme';
import { useRespondToFriendRequest } from '../../hooks/useFriendRequests';
import { Button } from '../ui/Button';
import { InlineFeedback } from '../ui/InlineFeedback';

/** One observer per request: another row's command cannot own these controls. */
export function FriendRequestActions({
  friendshipId,
  name = 'this user',
}: {
  friendshipId: string;
  name?: string;
}) {
  const respond = useRespondToFriendRequest();
  const submitting = useRef(false);
  const submit = async (accept: boolean) => {
    if (submitting.current || respond.isPending) return;
    submitting.current = true;
    try {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      // An unconfirmed response must retry the same command, not reverse intent.
      await respond.mutateAsync(
        respond.isError && respond.variables ? respond.variables : { friendshipId, accept },
      );
    } catch {
      // The row keeps its error and original variables for explicit retry.
    } finally {
      submitting.current = false;
    }
  };
  if (respond.isError)
    return (
      <View style={{ gap: Spacing.sm }}>
        <InlineFeedback message="Could not confirm this response. Retry the same response to check it." />
        <Button
          size="sm"
          variant="secondary"
          onPress={() => void submit(respond.variables?.accept ?? true)}
          accessibilityLabel={`Retry friend response for ${name}`}
        >
          Retry response
        </Button>
      </View>
    );
  const busy = respond.isPending || respond.isSuccess;
  return (
    <View style={{ flexDirection: 'row', gap: Spacing.sm, justifyContent: 'flex-end' }}>
      <Button
        size="sm"
        onPress={() => void submit(true)}
        disabled={busy}
        loading={respond.isPending && respond.variables?.accept === true}
        accessibilityLabel={`Accept friend request from ${name}`}
      >
        Accept
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onPress={() => void submit(false)}
        disabled={busy}
        loading={respond.isPending && respond.variables?.accept === false}
        accessibilityLabel={`Decline friend request from ${name}`}
      >
        Decline
      </Button>
    </View>
  );
}
