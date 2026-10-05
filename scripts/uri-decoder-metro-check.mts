// Compile with the installed iOS Metro transformer, then execute the parser
// bundle in a bounded JS VM. This is not a physical-device/Hermes smoke test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import ts from 'typescript';
import { runInNewContext } from 'node:vm';
import { record } from './database/contracts.mts';
const candidate = resolve(process.env.URI_TEST_ROOT || '.');
const requireCandidate = createRequire(resolve(candidate, 'package.json'));
// The requested candidate chooses the runtime; the installed package declarations
// describe these exact public APIs without an untyped ambient module.
const { getDefaultConfig } = requireCandidate(
  'expo/metro-config',
) as typeof import('expo/metro-config.js');
// Expo's wrapper re-exports this same Metro runtime and declares the config
// shape returned by Expo's getDefaultConfig (no bundler/version replacement).
const Metro = requireCandidate('metro') as typeof import('@expo/metro/metro');
const output = resolve(process.env.URI_TEST_OUTPUT || 'test-results/ios-security-103/metro-security');
mkdirSync(output, { recursive: true });
const entry = resolve(output, 'entry.js');
writeFileSync(entry,ts.transpileModule(readFileSync('scripts/uri-decoder-metro-entry.mts','utf8'),{
  fileName:'uri-decoder-metro-entry.mts',compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText);
process.chdir(candidate);
(async () => {
  const defaults = getDefaultConfig(candidate);
  // Metro's normal loadConfig adds projectRoot to watchFolders. runBuild receives
  // a complete config here, so retain that same root instead of indexing only entry.
  const config = { ...defaults,
    watchFolders: [candidate, ...defaults.watchFolders, output],
    resolver: { ...defaults.resolver, nodeModulesPaths: [resolve(candidate, 'node_modules')] },
    maxWorkers: 2, resetCache: true,
  };
  const result = await Metro.runBuild(config, { entry, platform: 'ios', dev: false, minify: true });
  const context: {
    console: Console;
    __DEV__: boolean;
    setTimeout: typeof setTimeout;
    clearTimeout: typeof clearTimeout;
    __URI_SECURITY_RESULT__?: unknown;
  } = { console, __DEV__: false, setTimeout, clearTimeout };
  runInNewContext(result.code, context, { timeout: 8000 });
  assert.ok(record(context.__URI_SECURITY_RESULT__));
  assert.equal(context.__URI_SECURITY_RESULT__.passed, true);
  writeFileSync(
    resolve(output, 'result.json'),
    JSON.stringify(
      {
        at: new Date().toISOString(),
        platform: 'ios',
        runtime: 'Node VM executing minified Metro output',
        ...context.__URI_SECURITY_RESULT__,
      },
      null,
      2,
    ),
  );
  console.log('11 parser/router assertions passed in minified iOS Metro output.');
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
