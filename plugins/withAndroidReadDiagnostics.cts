import type { ConfigPlugin } from '@expo/config-plugins';
import type { ExpoClientPatch } from './android-read-diagnostics/expoClientPatch.cts';
const {
  withMainApplication,
  withDangerousMod,
}: typeof import('@expo/config-plugins') = require('@expo/config-plugins');
const { copyFileSync, mkdirSync }: typeof import('node:fs') = require('node:fs');
const { join }: typeof import('node:path') = require('node:path');
const {
  patchExpoClient,
}: ExpoClientPatch = require('./android-read-diagnostics/expoClientPatch.cts');
const {
  destinations,
}: import('./mobileEnvironment.cts').MobileEnvironmentPolicy = require('./mobileEnvironment.cts');

type Environment = 'production' | 'staging';
function hosts(environment: Environment) {
  if (environment !== 'production' && environment !== 'staging')
    throw Error('Unknown diagnostic environment');
  return [
    new URL(destinations[environment].database).hostname,
    new URL(destinations[environment].worker).hostname,
  ] as const;
}

function instrumentMainApplication(
  contents: string,
  language: string,
  environment: Environment = 'production',
): string {
  const [host, gatewayHost] = hosts(environment);
  const INSTALL = `com.doji.network.DojiReadResponseHints.install("${host}", "${gatewayHost}")`;
  const LEGACY_INSTALL = `com.doji.network.DojiReadResponseHints.install("${host}")`;
  if (language !== 'kt')
    throw new Error('Android diagnostic plugin requires the reviewed Kotlin application template');
  const otherCode = contents.replace(INSTALL, '').replace(LEGACY_INSTALL, '');
  if (
    otherCode.includes('setCustomClientBuilder') ||
    otherCode.includes('setOkHttpClientFactory') ||
    otherCode.includes('DojiReadResponseHints')
  ) {
    throw new Error(
      'Existing Android networking customization requires manual compatibility review',
    );
  }
  if (contents.includes(INSTALL)) {
    if (contents.includes(LEGACY_INSTALL)) throw new Error('Mixed diagnostic installers');
    return contents;
  }
  if (contents.includes(LEGACY_INSTALL)) {
    if (contents.split(LEGACY_INSTALL).length !== 2)
      throw new Error('Duplicate legacy diagnostic installer');
    return instrumentMainApplication(contents.replace(LEGACY_INSTALL, ''), language, environment);
  }
  if (
    contents.includes('setCustomClientBuilder') ||
    contents.includes('setOkHttpClientFactory') ||
    contents.includes('DojiReadResponseHints')
  ) {
    throw new Error(
      'Existing Android networking customization requires manual compatibility review',
    );
  }
  const entry = 'super.onCreate()';
  if (contents.split(entry).length !== 2)
    throw new Error('Expected one Android onCreate entry point');
  return contents.replace(entry, `${entry}\n    ${INSTALL}`);
}

const withAndroidReadDiagnostics: ConfigPlugin<{ environment?: Environment } | void> = (
  config,
  options,
) => {
  const environment = options?.environment ?? 'production';
  const [host, gatewayHost] = hosts(environment);
  config = withMainApplication(config, (mod) => {
    mod.modResults.contents = instrumentMainApplication(
      mod.modResults.contents,
      mod.modResults.language,
      environment,
    );
    return mod;
  });
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      patchExpoClient(mod.modRequest.projectRoot, host, gatewayHost);
      const destination = join(
        mod.modRequest.platformProjectRoot,
        'app/src/main/java/com/doji/network',
      );
      mkdirSync(destination, { recursive: true });
      copyFileSync(
        join(__dirname, 'android-read-diagnostics/DojiReadResponseHints.java'),
        join(destination, 'DojiReadResponseHints.java'),
      );
      return mod;
    },
  ]);
};

module.exports = withAndroidReadDiagnostics;
module.exports.instrumentMainApplication = instrumentMainApplication;
