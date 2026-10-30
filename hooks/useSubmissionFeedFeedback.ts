import { useEffect } from 'react';
import { apiFailureDetails } from '../lib/apiFailureTelemetry';
import { confirmedSubmission, observeSubmissionFeed } from '../lib/submissionJourney';

export function useSubmissionFeedFeedback(userId: string | undefined, userEventId: string | undefined,
  error: unknown, ready: boolean) {
  useEffect(() => {
    if (error) observeSubmissionFeed(userId, userEventId, 'failed', error);
    else if (ready) observeSubmissionFeed(userId, userEventId, 'rendered');
  }, [userId, userEventId, error, ready]);
  const { kind } = apiFailureDetails(error);
  if (kind === 'authorization') return 'We couldn’t verify access to your feed. Please sign in again.';
  if (confirmedSubmission(userId, userEventId)) return 'Your answer was submitted. We couldn’t load the feed yet. Reload the feed; you don’t need to submit again.';
  if (kind === 'rate_limit') return 'Please wait a moment, then reload your feed.';
  if (kind === 'timeout') return 'The feed took too long to respond. Please reload it.';
  if (kind === 'network') return 'We couldn’t reach Doji. Check your connection, then reload your feed.';
  return 'Doji couldn’t load your feed right now. Please reload it.';
}
