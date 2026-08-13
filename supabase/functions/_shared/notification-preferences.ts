export function pushPreferenceEnabled(
  preferences: Record<string, unknown> | null | undefined,
  preferenceKey: string | null,
): boolean {
  if (!preferences || typeof preferences !== 'object') return true;
  if (preferences.push_enabled === false) return false;
  if (!preferenceKey) return true;
  return preferences[preferenceKey] !== false;
}
