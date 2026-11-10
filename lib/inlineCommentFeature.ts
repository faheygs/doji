/** The additive read contract is qualified only on the isolated staging backend.
 * Production keeps its existing reader until that boundary is separately released. */
export function inlineCommentPagingEnabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_APP_ENV === 'staging' &&
    process.env.EXPO_PUBLIC_SUPABASE_URL === 'https://ohrcupagdoilkwhecict.supabase.co' &&
    (process.env.EXPO_PUBLIC_RELEASE_CHANNEL === 'development' ||
      process.env.EXPO_PUBLIC_RELEASE_CHANNEL === 'staging')
  );
}
