import { QueryCache } from '@tanstack/react-query';
import { apiAttemptDetails, queryFailureOperation, reportApiFailure } from './apiFailureTelemetry';

/** Keep the first retry failure and the terminal attempt together in ONE existing
 * rate-limited incident. No per-attempt events, persistent IDs, or success logging.
 */
export function createApiQueryCache(): QueryCache {
  type Sequence = { start: number; count: number; first?: ReturnType<typeof apiAttemptDetails> };
  const sequences = new WeakMap<object, Sequence>();
  const cache = new QueryCache({
    onError: (error, query) => {
      const sequence = sequences.get(query);
      sequences.delete(query);
      reportApiFailure('query', queryFailureOperation(query.queryKey), error, sequence ? {
        attempt_count: Math.min(100, sequence.count + 1),
        fetch_elapsed_ms: Math.min(120_000, Math.max(0, Math.round(Date.now() - sequence.start))),
        attempts: [...(sequence.first ? [sequence.first] : []), apiAttemptDetails(error)],
      } : undefined);
    },
  });
  cache.subscribe(event => {
    if (event.type === 'removed') sequences.delete(event.query);
    if (event.type !== 'updated') return;
    const { query, action } = event;
    if (action.type === 'fetch') sequences.set(query, { start: Date.now(), count: 0 });
    if (action.type === 'success' || (action.type === 'setState' && query.state.fetchStatus === 'idle')) {
      sequences.delete(query);
    }
    if (action.type === 'failed') {
      const sequence = sequences.get(query);
      if (sequence) {
        sequence.count = action.failureCount;
        sequence.first ??= apiAttemptDetails(action.error);
      }
    }
  });
  return cache;
}
