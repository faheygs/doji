// Offline native-marker controls on the dedicated API 30 emulator only.
// Always restore the prior marker; never launch the member application.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
const adb = resolve('.artifacts/android-tools/sdk/platform-tools/adb.exe');
const serial = 'emulator-5582';
const run = (args:string[]) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 60000 });
assert.equal(run(['emu', 'avd', 'name']).split('\n')[0]?.trim(), 'DojiApiLab30');
assert.equal(run(['shell', 'getprop', 'ro.build.version.sdk']).trim(), '30');
const key = 'firebase.test.lab';
const original = run(['shell', 'settings', 'get', 'system', key]).trim();
// Only restore documented or our synthetic values; stop rather than echo arbitrary device data.
assert.ok(['null', 'true', 'false', 'doji-offline-probe'].includes(original), 'Unexpected existing marker; refusing to modify');
const set = (value:string) => value === 'null'
  ? run(['shell', 'settings', 'delete', 'system', key])
  : run(['shell', 'settings', 'put', 'system', key, value]);
try {
  for (const [value, expected] of [['null', 'not_detected'], ['true', 'detected'], ['false', 'not_detected'], ['doji-offline-probe', 'unknown']] as const) {
    set(value);
    assert.equal(run(['shell', 'settings', 'get', 'system', key]).trim(), value);
    const output = execFileSync(process.execPath, [resolve('scripts/android-expo-read-probe/run.mts'), '--api30'], {
      encoding: 'utf8', timeout: 120000,
    });
    const line=output.trim().split('\n').at(-1);assert.ok(line);
    const result = JSON.parse(line);
    assert.equal(result.passed, true);
    assert.equal(result.firebaseTestLab, expected);
    console.log(JSON.stringify({ control: value, ...result }));
  }
} finally {
  set(original);
  assert.equal(run(['shell', 'settings', 'get', 'system', key]).trim(), original, 'Test Lab setting restoration failed');
}
