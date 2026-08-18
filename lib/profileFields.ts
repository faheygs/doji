/** Public profile fields safe to expose in feeds, search, friends, and rankings. */
export const PUBLIC_PROFILE_COLUMNS =
  'id,username,display_name,avatar_url,avatar_gradient,bio,current_streak,longest_streak,total_completions,total_missed,xp,level,reactions_received,reactions_given,accent_theme,equipped_border_key,equipped_title_key,created_at,updated_at' as const;

export function embeddedPublicProfile(
  alias: string,
  relationship = 'profiles',
): string {
  return `${alias}:${relationship}(${PUBLIC_PROFILE_COLUMNS})`;
}
