import { MutationCache, QueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';
import { reportApiFailure } from './apiFailureTelemetry';
import { mutationFailureOperation } from './diagnosticOperations';
import { createApiQueryCache } from './apiQueryCache';
import { retryDelayWithJitter, shouldRetryQuery } from './apiRetry';
import { PERSISTED_QUERY_GC_MS } from './queryPersistence';

export const queryClient = new QueryClient({
  queryCache: createApiQueryCache(),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) =>
      reportApiFailure('mutation', mutationFailureOperation(mutation.options.mutationKey), error),
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      // Recent inactive social surfaces remain available for instant reopen.
      // Disk persistence is separately allowlisted and size-bounded.
      gcTime: PERSISTED_QUERY_GC_MS,
      retry: shouldRetryQuery,
      retryDelay: retryDelayWithJitter,
      // Native lifecycle and socket recovery are reconciled explicitly by
      // QueryLifecycle/useDomainRealtime. Enabling the web defaults here caused
      // the same cold-start query set to run two or three times concurrently.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      // Native read availability must not queue commands for automatic replay.
      // Keep their existing immediate execution/error handling, even offline.
      networkMode: Platform.OS === 'web' ? 'online' : 'always',
      // Commands opt into retries only when they are atomic and carry a stable
      // idempotency key. Blindly replaying arbitrary mutations is unsafe.
      retry: false,
    },
  },
});
