import AsyncStorage from '@react-native-async-storage/async-storage';
import { normalizeAppTheme } from '../constants/theme';
import type { Profile } from '../types/database';
import { mergeNotificationPreferences } from './notificationPreferences';

export const PROFILE_FETCH_ATTEMPTS = 3;
// Daily activation creates a short, legitimate read burst. Account bootstrap is
// security-sensitive, but a 3s handset deadline was shorter than the observed
// successful production round-trip during that burst and falsely presented a
// fatal account error. Keep the gate server-authoritative while allowing the
// same bounded deadline used by other critical reads.
export const PROFILE_REQUEST_TIMEOUT_MS = 10_000;
const PROFILE_RETRY_DELAYS_MS = [250, 750] as const;
const PROFILE_CACHE_PREFIX = '@doji/profile-cache:';

export const profileCacheKey = (userId: string) => `${PROFILE_CACHE_PREFIX}${userId}`;
export const PROFILE_CACHE_WAIT_MS = 1_200;

/** Disk presentation is optional; a stalled native read must not block authority. */
export function createProfileCacheReader(load: (userId: string) => Promise<string | null>) {
  let busy = false;
  return (userId: string): Promise<string | null> => {
    // Do not join an older account lifetime or multiply uncancellable native work.
    // The owning store request alone may consume its snapshot.
    if (busy) return Promise.resolve(null);
    busy = true;
    const deadline = Date.now() + PROFILE_CACHE_WAIT_MS;
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(null), PROFILE_CACHE_WAIT_MS);
      const settled = (value: string | null) => {
        clearTimeout(timer);
        busy = false;
        resolve(Date.now() < deadline ? value : null);
      };
      try {
        void load(userId).then(settled, () => settled(null));
      } catch {
        settled(null);
      }
    });
  };
}

export const readCachedProfile = createProfileCacheReader(userId =>
  AsyncStorage.getItem(profileCacheKey(userId)));

export function persistProfile(profile: Profile): void {
  void AsyncStorage.setItem(profileCacheKey(profile.id), JSON.stringify(profile)).catch(() => {});
}

export function normalizeProfile(profile: Profile): Profile {
  return {
    ...profile,
    app_theme: normalizeAppTheme(profile.app_theme),
    notification_preferences: mergeNotificationPreferences(profile.notification_preferences),
  };
}

export function waitForProfileRetry(attempt: number): Promise<void> {
  const delay = PROFILE_RETRY_DELAYS_MS[attempt] ?? 750;
  return new Promise((resolve) => {
    setTimeout(resolve, delay);
  });
}

export function isNonRetryableProfileError(error: {
  message?: string;
  status?: number;
  code?: string;
}): boolean {
  const status = Number(error.status ?? 0);
  if (status === 401 || status === 403 || status === 404) return true;
  const code = String(error.code ?? '').toUpperCase();
  if (code === 'PGRST116' || code === '42501') return true;
  const message = String(error.message ?? '').toLowerCase();
  return message.includes('jwt') || message.includes('unauthorized') || message.includes('forbidden');
}
