export function pushPreferenceEnabled(
  preferences: Record<string, unknown> | null | undefined,
  preferenceKey: string | null,
): boolean {
  if (!preferences || typeof preferences !== 'object') return true;
  if (preferences.push_enabled === false) return false;
  if (!preferenceKey) return true;
  if (preferences[preferenceKey] === false) return false;

  // New settings remain compatible with already-installed clients. A legacy
  // opt-out is never silently re-enabled while those builds age out.
  if (preferenceKey === 'doji_live') return preferences.doji_start !== false;
  if (preferenceKey === 'friend_requests') return preferences.friend_request !== false;
  if (preferenceKey === 'mentions_replies') {
    return preferences.mention !== false && preferences.comment_reply !== false;
  }
  if (preferenceKey === 'reviews_account') return preferences.suggestion !== false;
  return true;
}
