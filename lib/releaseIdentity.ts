import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type MobileReleaseIdentity = Readonly<{
  appVersion: string | null;
  nativeBuildNumber: string | null;
  platform: 'ios' | 'android' | 'web';
  releaseChannel: string;
}>;

function text(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim();
  return normalized || null;
}

export function mobileReleaseIdentity(): MobileReleaseIdentity {
  const platform = Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
  const fallbackBuild =
    platform === 'ios'
      ? Constants.expoConfig?.ios?.buildNumber
      : platform === 'android'
        ? Constants.expoConfig?.android?.versionCode
        : null;
  const configuredChannel = process.env.EXPO_PUBLIC_RELEASE_CHANNEL?.trim().toLowerCase();
  const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV?.trim().toLowerCase();

  return {
    appVersion: text(Constants.nativeAppVersion ?? Constants.expoConfig?.version),
    nativeBuildNumber: text(Constants.nativeBuildVersion ?? fallbackBuild),
    platform,
    releaseChannel:
      configuredChannel ||
      (appEnvironment === 'production'
        ? 'production'
        : appEnvironment === 'preview'
          ? 'preview'
          : 'development'),
  };
}

export function sentryReleaseIdentity(): { release?: string; dist?: string } {
  const identity = mobileReleaseIdentity();
  if (!identity.appVersion) return {};
  const appId =
    identity.platform === 'ios'
      ? Constants.expoConfig?.ios?.bundleIdentifier
      : identity.platform === 'android'
        ? Constants.expoConfig?.android?.package
        : Constants.expoConfig?.slug;
  return {
    release: `${appId || 'doji'}@${identity.appVersion}`,
    dist: identity.nativeBuildNumber ?? undefined,
  };
}
