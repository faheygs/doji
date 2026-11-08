import { View } from 'react-native';
import { InlineFeedback } from '../ui/InlineFeedback';
import { Button } from '../ui/Button';
import { Spacing } from '../../constants/theme';

/** Keep failed media local to its card; social controls and navigation stay usable. */
export function PostMediaFeedback({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
      <InlineFeedback message={message} />
      <Button onPress={onRetry}>Retry media</Button>
    </View>
  );
}
