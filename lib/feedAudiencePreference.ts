import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FeedAudience } from './feedAudience';

const FEED_AUDIENCE_KEY_PREFIX = '@doji/feed-audience';

function storageKey(userId: string): string {
  return `${FEED_AUDIENCE_KEY_PREFIX}:${userId}`;
}

export function isFeedAudience(value: unknown): value is FeedAudience {
  return value === 'everyone' || value === 'friends';
}

/** New accounts default to the broad feed; an explicit choice is account-scoped. */
export async function readFeedAudiencePreference(userId: string): Promise<FeedAudience> {
  const stored = await AsyncStorage.getItem(storageKey(userId));
  return isFeedAudience(stored) ? stored : 'everyone';
}

export async function writeFeedAudiencePreference(
  userId: string,
  audience: FeedAudience,
): Promise<void> {
  await AsyncStorage.setItem(storageKey(userId), audience);
}
