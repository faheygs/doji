import { QueryClient } from '@tanstack/react-query';
import { retryDelayWithJitter, shouldRetryQuery } from './apiRetry';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 2,
      retry: shouldRetryQuery,
      retryDelay: retryDelayWithJitter,
      // Native lifecycle and socket recovery are reconciled explicitly by
      // QueryLifecycle/useDomainRealtime. Enabling the web defaults here caused
      // the same cold-start query set to run two or three times concurrently.
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
    mutations: {
      // Commands opt into retries only when they are atomic and carry a stable
      // idempotency key. Blindly replaying arbitrary mutations is unsafe.
      retry: false,
    },
  },
});
