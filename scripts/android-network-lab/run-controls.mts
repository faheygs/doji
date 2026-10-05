// Runs only the dedicated local synthetic harness; never selects a physical phone.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const adb = resolve('.artifacts/android-tools/sdk/platform-tools/adb.exe');
const api30 = process.argv[3] === '--api30';
assert.ok(process.argv.length <= 4 && (!process.argv[3] || api30));
const serial = api30 ? 'emulator-5582' : 'emulator-5580';
const run = (args:string[]) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 60000 });
assert.equal(run(['emu', 'avd', 'name']).split(/\r?\n/)[0]?.trim(), api30 ? 'DojiApiLab30' : 'DojiNetworkLab36');
assert.equal(run(['shell', 'getprop', 'ro.build.version.sdk']).trim(), api30 ? '30' : '36');
const repeats = Number(process.argv[2] ?? 1);
assert.ok(Number.isInteger(repeats) && repeats >= 1 && repeats <= 3);
const root = resolve('test-results/android-network-lab');
mkdirSync(root, { recursive: true });
for (let i = 0; i < repeats; i++) {
  const at = new Date().toISOString();
  const output = run(['shell', 'am', 'instrument', '-w', 'com.doji.networklab/.NetworkLab']);
  const file = resolve(root, `native-${at.replace(/[:.]/g, '-')}.log`);
  writeFileSync(file, output, { flag: 'wx' });
  assert.ok(!output.includes('FAIL'), `Native harness failed; see ${file}`);
  assert.ok(output.includes('PASS 96 native control assertions'), `Missing full completion; see ${file}`);
  console.log(JSON.stringify({ at, serial, assertions: 96, passed: true, path: file,
    productionRootCauseReproduced: false, productionTraffic: false }));
}
