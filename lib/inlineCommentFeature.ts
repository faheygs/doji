/** Require matching release bindings; backend qualification precedes native distribution. */
export function inlineCommentPagingEnabled(): boolean {
  return (
    (process.env.EXPO_PUBLIC_APP_ENV === 'staging' &&
      process.env.EXPO_PUBLIC_SUPABASE_URL === 'https://ohrcupagdoilkwhecict.supabase.co' &&
      (process.env.EXPO_PUBLIC_RELEASE_CHANNEL === 'development' ||
        process.env.EXPO_PUBLIC_RELEASE_CHANNEL === 'staging')) ||
    (process.env.EXPO_PUBLIC_APP_ENV === 'production' &&
      process.env.EXPO_PUBLIC_RELEASE_CHANNEL === 'production' &&
      process.env.EXPO_PUBLIC_SUPABASE_URL === 'https://tvixsmqxotuvyjqzmjla.supabase.co')
  );
}
