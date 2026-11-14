import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Profile } from '../types/database';

const RECENT_SEARCH_LIMIT = 10;
export const SEARCH_QUERY_LIMIT = 100;

export type RecentProfileSearch = Pick<
  Profile,
  'id' | 'username' | 'display_name' | 'avatar_url' | 'avatar_gradient' | 'equipped_border_key'
>;

export type RecentTextSearch = { id: string; kind: 'query'; query: string };
export type RecentSearch = RecentProfileSearch | RecentTextSearch;
export const isTextSearch = (entry: RecentSearch): entry is RecentTextSearch =>
  'kind' in entry && entry.kind === 'query';
export function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ').slice(0, SEARCH_QUERY_LIMIT);
}

function storageKey(userId: string): string {
  return `doji:recent-profile-searches:${userId}`;
}

function isRecentProfileSearch(value: unknown): value is RecentProfileSearch {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.username === 'string' &&
    typeof item.display_name === 'string' &&
    (item.avatar_url === null || typeof item.avatar_url === 'string') &&
    Array.isArray(item.avatar_gradient) &&
    item.avatar_gradient.length === 2 &&
    item.avatar_gradient.every((color) => typeof color === 'string') &&
    (item.equipped_border_key === null || typeof item.equipped_border_key === 'string')
  );
}

export function normalizeRecentProfileSearches(value: unknown): RecentSearch[] {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, RecentSearch>();
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      item.kind === 'query' &&
      typeof item.query === 'string'
    ) {
      const query = normalizeSearchQuery(item.query);
      const id = `query:${query.toLowerCase()}`;
      if (query.length >= 2 && !unique.has(id)) unique.set(id, { id, kind: 'query', query });
    } else if (isRecentProfileSearch(item) && !unique.has(item.id)) unique.set(item.id, item);
    if (unique.size === RECENT_SEARCH_LIMIT) break;
  }
  return [...unique.values()];
}

export function addRecentProfileSearch(
  current: readonly RecentSearch[],
  profile: RecentProfileSearch,
): RecentSearch[] {
  return [profile, ...current.filter((item) => item.id !== profile.id)].slice(
    0,
    RECENT_SEARCH_LIMIT,
  );
}

export function addRecentSearchQuery(
  current: readonly RecentSearch[],
  value: string,
): RecentSearch[] {
  const query = normalizeSearchQuery(value);
  if (query.length < 2) return [...current];
  const entry: RecentTextSearch = { id: `query:${query.toLowerCase()}`, kind: 'query', query };
  return [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, RECENT_SEARCH_LIMIT);
}

export async function loadRecentProfileSearches(userId: string): Promise<RecentSearch[]> {
  const raw = await AsyncStorage.getItem(storageKey(userId));
  if (!raw) return [];
  try {
    return normalizeRecentProfileSearches(JSON.parse(raw));
  } catch {
    return [];
  }
}

export async function saveRecentProfileSearches(
  userId: string,
  recents: readonly RecentSearch[],
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(recents));
}
