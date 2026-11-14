import type { ConfigContext, ExpoConfig } from 'expo/config';
import type { MobileEnvironmentPolicy } from './plugins/mobileEnvironment.cts';

const {
  variantFor,
  validateStagingEnvironment,
}: MobileEnvironmentPolicy = require('./plugins/mobileEnvironment.cts');

function appConfig({ config }: ConfigContext): ExpoConfig {
  const variant = variantFor(process.env);
  const base = config as ExpoConfig;
  // Preserve production configuration byte-for-byte at this boundary. Build numbers
  // remain an independently reviewed release allocation, not an implicit increment.
  if (variant === 'production') return base;
  validateStagingEnvironment(process.env, !!process.env.EAS_BUILD_PROFILE);
  const development = variant === 'development';
  const identity = `com.doit.challengeapp.${development ? 'development' : 'staging'}`;
  const buildNumber = process.env.DOJI_STAGING_BUILD_NUMBER || '1';
  const googleServicesFile = process.env.DOJI_STAGING_GOOGLE_SERVICES_FILE;
  if (process.env.EAS_BUILD_PLATFORM === 'android') {
    if (!googleServicesFile || googleServicesFile === './google-services.json')
      throw Error('A separate staging Android Firebase configuration is required');
    const { readFileSync }: typeof import('node:fs') = require('node:fs');
    const firebase = JSON.parse(readFileSync(googleServicesFile, 'utf8')) as {
      project_info?: { project_id?: string };
      client?: { client_info?: { android_client_info?: { package_name?: string } } }[];
    };
    const project = process.env.DOJI_STAGING_FIREBASE_PROJECT_ID;
    if (!project || project === 'doji-connect' || firebase.project_info?.project_id !== project)
      throw Error('A separately verified staging Firebase project is required');
    if (
      !firebase.client?.length ||
      firebase.client.some(
        (client) => client.client_info?.android_client_info?.package_name !== identity,
      )
    )
      throw Error('Staging Firebase configuration does not match this app identity');
  }
  return {
    ...base,
    name: development ? 'Doji Dev' : 'Doji Staging',
    icon: './assets/icon-staging.png',
    scheme: development ? 'doji-dev' : 'doji-staging',
    ios: { ...base.ios, bundleIdentifier: identity, buildNumber },
    android: {
      ...base.android,
      package: identity,
      googleServicesFile,
      versionCode: Number(buildNumber),
      adaptiveIcon: { foregroundImage: './assets/icon-staging.png', backgroundColor: '#7C3AED' },
    },
    plugins: base.plugins?.map((plugin) => {
      const name = typeof plugin === 'string' ? plugin : plugin[0];
      if (name === '@sentry/react-native/expo')
        return [name, { organization: 'doji-i0', project: 'doji-staging' }];
      if (name === './plugins/withAndroidReadDiagnostics')
        return [name, { environment: 'staging' }];
      return plugin;
    }),
    // OTA remains unconfigured; a staging binary must never inherit a future
    // production update URL/channel by accident.
    updates: { enabled: false },
    extra: { ...base.extra, dojiVariant: variant },
  };
}
module.exports = appConfig;
export type MobileAppConfig = typeof appConfig;
