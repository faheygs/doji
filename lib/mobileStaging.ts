// Staging cannot request provider tokens until its separate delivery setup is qualified.
export function stagingPushDisabled(): boolean {
  return (
    process.env.EXPO_PUBLIC_APP_ENV === 'staging' &&
    process.env.EXPO_PUBLIC_STAGING_PUSH_ENABLED !== 'true'
  );
}

export function nativePushEnvironment(): 'sandbox' | 'production' {
  if (process.env.EXPO_PUBLIC_APP_ENV === 'staging') {
    const environment = process.env.EXPO_PUBLIC_APNS_ENVIRONMENT;
    if (environment !== 'sandbox' && environment !== 'production')
      throw Error('Staging notification signing environment is not configured');
    return environment;
  }
  return process.env.EXPO_PUBLIC_APP_ENV === 'production' ? 'production' : 'sandbox';
}
