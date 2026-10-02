import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Spacing } from '../../constants/theme';
import { Text } from '../ui/Text';
import { Button } from '../ui/Button';
import { InlineFeedback } from '../ui/InlineFeedback';
import { Skeleton } from '../ui/Skeleton';
import { SubmissionCard } from './SubmissionCard';
import { canKeepQueryDataOnError } from '../../lib/queryDisplayState';
import type { ChallengeSuggestion } from '../../types/database';

type Props = {
  data?: ChallengeSuggestion[];
  error: unknown;
  isPending: boolean;
  isFetching: boolean;
  onRetry: () => void;
};

export function ProfileSubmissions({ data, error, isPending, isFetching, onRetry }: Props) {
  const visibleData = !error || canKeepQueryDataOnError(data, error) ? data : undefined;
  // Preserve the existing empty-success presentation, not an empty-error facade.
  if (!isPending && !error && !visibleData?.length) return null;
  return (
    <View style={styles.section}>
      <Text variant="headingMedium">My Submissions</Text>
      {error ? (
        <>
          <InlineFeedback message={visibleData !== undefined
            ? 'Could not refresh your submissions. Your last loaded history is shown below.'
            : 'Could not load your submissions. Please try again.'} />
          <Button variant="secondary" size="sm" onPress={onRetry} loading={isFetching}
            accessibilityLabel="Retry loading submissions">Try again</Button>
        </>
      ) : null}
      {isPending && data === undefined ? (
        <View accessibilityLabel="Loading submissions" accessibilityRole="progressbar">
          <Skeleton height={80} />
        </View>
      ) : null}
      {visibleData?.map(submission => <SubmissionCard key={submission.id} submission={submission} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { paddingHorizontal: Spacing.md, marginTop: Spacing.lg, gap: Spacing.sm },
});
