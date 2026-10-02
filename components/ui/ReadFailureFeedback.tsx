import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { InlineFeedback } from './InlineFeedback';
import { Button } from './Button';

/** Shared, persistent read-recovery feedback; never renders a raw API message. */
export function ReadFailureFeedback({ message, retrying, onRetry }: {
  message: string;
  retrying: boolean;
  onRetry: () => void;
}) {
  return <View style={styles.container}>
    <InlineFeedback message={message} />
    <Button variant="secondary" size="sm" loading={retrying} onPress={onRetry}
      accessibilityLabel="Try loading again">Try again</Button>
  </View>;
}

const styles = StyleSheet.create({ container: { margin: Spacing.md, gap: Spacing.sm } });
