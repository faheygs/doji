const { readFileSync, writeFileSync }:typeof import('node:fs') = require('node:fs');
const { dirname, join }:typeof import('node:path') = require('node:path');
const { createHash }:typeof import('node:crypto') = require('node:crypto');

// Expo has no per-fetch client customization API in this pinned SDK. Keep this
// patch Android-only and fail closed on SDK changes; do not replace the global
// OkHttp factory (that would also alter Fresco/WebSocket client defaults).
const VERSION = '57.0.26';
const SOURCE_HASH = '3c766cf8a30f00a91f3a6116aa9e7f6a44f26d7fe2179cd7c114cbbfb56b08ea';

function instrumentExpoClient(source:string, version:string, host:string, gatewayHost:string):string {
  if (version !== VERSION) throw new Error('Expo fetch diagnostics require SDK source compatibility review');
  const line = `      .addInterceptor(DojiReadResponseHints("${host}", "${gatewayHost}")) // Doji passive read observer\n`;
  const normalized = source.replace(/\r\n/g, '\n');
  const original = normalized.replace(line, '');
  const hash = createHash('sha256').update(original).digest('hex');
  if (hash !== SOURCE_HASH) throw new Error('Expo fetch source changed: review diagnostics before building');
  if (normalized.includes(line)) return normalized;
  const anchor = 'OkHttpClientProvider.createClient(reactContext)\n      .newBuilder()\n';
  if (original.split(anchor).length !== 2) throw new Error('Expected one Expo fetch client builder');
  return original.replace(anchor, anchor + line);
}

function patchExpoClient(projectRoot:string, host:string, gatewayHost:string):void {
  const packagePath = require.resolve('expo/package.json', { paths: [projectRoot] });
  const { version } = JSON.parse(readFileSync(packagePath, 'utf8'));
  const directory = join(dirname(packagePath), 'android/src/main/java/expo/modules/fetch');
  const sourcePath = join(directory, 'ExpoFetchModule.kt');
  const source = readFileSync(sourcePath, 'utf8');
  // Validate before any writes. Helper is generated from the exact same reviewed
  // Java source compiled by the RN fallback and native controls, in Expo's package.
  const patched = instrumentExpoClient(source, version, host, gatewayHost);
  const helper = readFileSync(join(__dirname, 'DojiReadResponseHints.java'), 'utf8');
  if (!helper.startsWith('package com.doji.network;')) throw new Error('Unexpected diagnostic helper package');
  writeFileSync(join(directory, 'DojiReadResponseHints.java'), helper.replace('package com.doji.network;', 'package expo.modules.fetch;'));
  if (source !== patched) writeFileSync(sourcePath, patched);
}

module.exports = { instrumentExpoClient, patchExpoClient };
export type ExpoClientPatch = {instrumentExpoClient:typeof instrumentExpoClient;patchExpoClient:typeof patchExpoClient};
