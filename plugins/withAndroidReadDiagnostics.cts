import type {ConfigPlugin} from '@expo/config-plugins';
import type {ExpoClientPatch} from './android-read-diagnostics/expoClientPatch.cts';
const { withMainApplication, withDangerousMod }:typeof import('@expo/config-plugins') = require('@expo/config-plugins');
const { copyFileSync, mkdirSync }:typeof import('node:fs') = require('node:fs');
const { join }:typeof import('node:path') = require('node:path');
const { patchExpoClient }:ExpoClientPatch = require('./android-read-diagnostics/expoClientPatch.cts');

const HOST = 'tvixsmqxotuvyjqzmjla.supabase.co';
const GATEWAY_HOST = 'doji-orchestrator.faheygs.workers.dev';
const INSTALL = `com.doji.network.DojiReadResponseHints.install("${HOST}", "${GATEWAY_HOST}")`;
const LEGACY_INSTALL = `com.doji.network.DojiReadResponseHints.install("${HOST}")`;

function instrumentMainApplication(contents:string, language:string):string {
  if (language !== 'kt') throw new Error('Android diagnostic plugin requires the reviewed Kotlin application template');
  const otherCode = contents.replace(INSTALL, '').replace(LEGACY_INSTALL, '');
  if (otherCode.includes('setCustomClientBuilder') || otherCode.includes('setOkHttpClientFactory') || otherCode.includes('DojiReadResponseHints')) {
    throw new Error('Existing Android networking customization requires manual compatibility review');
  }
  if (contents.includes(INSTALL)) {
    if (contents.includes(LEGACY_INSTALL)) throw new Error('Mixed diagnostic installers');
    return contents;
  }
  if (contents.includes(LEGACY_INSTALL)) {
    if (contents.split(LEGACY_INSTALL).length !== 2) throw new Error('Duplicate legacy diagnostic installer');
    return instrumentMainApplication(contents.replace(LEGACY_INSTALL, ''), language);
  }
  if (contents.includes('setCustomClientBuilder') || contents.includes('setOkHttpClientFactory') || contents.includes('DojiReadResponseHints')) {
    throw new Error('Existing Android networking customization requires manual compatibility review');
  }
  const entry = 'super.onCreate()';
  if (contents.split(entry).length !== 2) throw new Error('Expected one Android onCreate entry point');
  return contents.replace(entry, `${entry}\n    ${INSTALL}`);
}

const withAndroidReadDiagnostics:ConfigPlugin = (config) => {
  config = withMainApplication(config, mod => {
    mod.modResults.contents = instrumentMainApplication(mod.modResults.contents, mod.modResults.language);
    return mod;
  });
  return withDangerousMod(config, ['android', async mod => {
    patchExpoClient(mod.modRequest.projectRoot, HOST, GATEWAY_HOST);
    const destination = join(mod.modRequest.platformProjectRoot, 'app/src/main/java/com/doji/network');
    mkdirSync(destination, { recursive: true });
    copyFileSync(join(__dirname, 'android-read-diagnostics/DojiReadResponseHints.java'), join(destination, 'DojiReadResponseHints.java'));
    return mod;
  }]);
}

module.exports = withAndroidReadDiagnostics;
module.exports.instrumentMainApplication = instrumentMainApplication;
