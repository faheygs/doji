import { readFileSync } from 'node:fs';
const { instrumentExpoClient } = require('../../plugins/android-read-diagnostics/expoClientPatch.cts');
const source = readFileSync('node_modules/expo/android/src/main/java/expo/modules/fetch/ExpoFetchModule.kt', 'utf8');
const version = require('expo/package.json').version;
const host = 'tvixsmqxotuvyjqzmjla.supabase.co';
const gateway = 'doji-orchestrator.faheygs.workers.dev';

test('patches only the pinned Expo Android fetch builder and is idempotent', () => {
  const result = instrumentExpoClient(source, version, host, gateway);
  const line = `      .addInterceptor(DojiReadResponseHints("${host}", "${gateway}")) // Doji passive read observer\n`;
  expect(result.split(line)).toHaveLength(2);
  expect(result).toContain(`.newBuilder()\n${line}      .addInterceptor(OkHttpFileUrlInterceptor`);
  expect(instrumentExpoClient(result, version, host, gateway)).toBe(result);
  expect(result).not.toContain('setOkHttpClientFactory');
  // No SDK behavior changes beyond the single passive observer attachment.
  expect(result.replace(line, '')).toBe(source.replace(/\r\n/g, '\n').replace(line, ''));
});

test('fails closed on SDK upgrades, unknown edits and duplicate observers', () => {
  for (const unreviewed of ['57.0.26', '57.0.28', '58.0.0'])
    expect(() => instrumentExpoClient(source, unreviewed, host, gateway)).toThrow('compatibility');
  expect(() => instrumentExpoClient(source + '\n// unrelated modification', version, host, gateway)).toThrow('source changed');
  const result = instrumentExpoClient(source, version, host, gateway);
  expect(() => instrumentExpoClient(result.replace('.newBuilder()', '.newBuilder()\n      .addInterceptor(other)'), version, host, gateway)).toThrow();
  const observer = result.split('\n').find((line: string) => line.includes('// Doji passive read observer'));
  expect(() => instrumentExpoClient(result.replace(observer, `${observer}\n${observer}`), version, host, gateway)).toThrow();
  expect(() => instrumentExpoClient(result, version, host, 'different.invalid')).toThrow();
});

test('generates the Expo helper from the reviewed Java source without a global client factory', () => {
  const fs = require('node:fs');
  const writes = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
  try {
    jest.isolateModules(() => {
      require('../../plugins/android-read-diagnostics/expoClientPatch.cts').patchExpoClient(process.cwd(), host, gateway);
    });
    const helper = readFileSync('plugins/android-read-diagnostics/DojiReadResponseHints.java', 'utf8');
    expect(writes).toHaveBeenCalledWith(expect.stringMatching(/expo[\\/]modules[\\/]fetch[\\/]DojiReadResponseHints.java$/),
      helper.replace('package com.doji.network;', 'package expo.modules.fetch;'));
    expect(helper).not.toContain('setOkHttpClientFactory');
    for (const [path] of writes.mock.calls) expect(path).toMatch(/expo[\\/]android[\\/]src/);
  } finally { writes.mockRestore(); }
});
