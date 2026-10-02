import { isTransientApiError } from './apiRetry';

/** Only transient refresh errors may retain data. Auth/unknown failures fail closed. */
export function canKeepQueryDataOnError(data: unknown, error: unknown): boolean {
  const value = error as { status?: number; code?: string } | null;
  if (value?.status === 401 || value?.status === 403 ||
    ['42501', 'PGRST301', 'PGRST302', 'PGRST303'].includes(value?.code ?? '')) return false;
  return data !== undefined && isTransientApiError(error);
}
