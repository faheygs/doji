export const QUERY_CACHE_STORAGE_PREFIX = 'doji-query-cache-v3:';

export function queryCacheStorageKey(userId: string): string {
  return `${QUERY_CACHE_STORAGE_PREFIX}${userId}`;
}
