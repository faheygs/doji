/** Dev qualification only. Installed Staging/production binaries stay gated. */
export function commentPagingEnabled(binding: {
  development: boolean;
  environment?: string;
  channel?: string;
  url?: string;
}): boolean {
  return (
    binding.development &&
    binding.environment === 'staging' &&
    binding.channel === 'development' &&
    binding.url === 'https://ohrcupagdoilkwhecict.supabase.co'
  );
}

// Start this Dev source only after the separately approved staging SQL/index
// rollout. No production fallback or runtime discovery of missing RPCs.
export const COMMENT_PAGING_V2_ENABLED = commentPagingEnabled({
  development: __DEV__,
  environment: process.env.EXPO_PUBLIC_APP_ENV,
  channel: process.env.EXPO_PUBLIC_RELEASE_CHANNEL,
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
});
