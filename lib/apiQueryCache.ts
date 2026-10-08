import { QueryCache } from '@tanstack/react-query';
import { apiAttemptDetails, queryFailureOperation, reportApiFailure } from './apiFailureTelemetry';
import { diagnosticSessionIsCurrent, mobileDiagnosticSnapshot, recordDiagnosticOutcome } from './mobileDiagnosticContext';

/** Keep the first retry failure and the terminal attempt together in ONE existing
 * rate-limited incident. Recovery is an in-memory breadcrumb, not another event.
 */
export function createApiQueryCache(): QueryCache {
  type Sequence = { start: number; count: number; session?: string | number | boolean; first?: ReturnType<typeof apiAttemptDetails> };
  const sequences = new WeakMap<object, Sequence>();
  const cache = new QueryCache({
    onSuccess: (_data, query) => {
      const sequence = sequences.get(query);
      if (sequence && diagnosticSessionIsCurrent(sequence.session)) {
        recordDiagnosticOutcome(queryFailureOperation(query.queryKey), sequence.count ? 'recovered' : 'success', sequence.count + 1);
      }
      sequences.delete(query);
    },
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
    if (action.type === 'fetch') sequences.set(query, { start: Date.now(), count: 0, session: mobileDiagnosticSnapshot().session_id });
    if (action.type === 'setState' && query.state.fetchStatus === 'idle') {
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
