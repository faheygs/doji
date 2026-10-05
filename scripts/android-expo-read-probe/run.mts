// Install/run only the offline, separately packaged integration probe.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';
import {evidenceRecord} from '../release-evidence.mts';
const adb = resolve('.artifacts/android-tools/sdk/platform-tools/adb.exe');
const aapt = resolve('.artifacts/android-tools/sdk/build-tools/36.0.0/aapt2.exe');
const apk = resolve('.artifacts/android-expo-read-probe/build/outputs/apk/release/app-release.apk');
assert.ok(process.argv.length <= 3 && (!process.argv[2] || process.argv[2] === '--api30'));
const api30 = process.argv[2] === '--api30';
const serial = api30 ? 'emulator-5582' : 'emulator-5580';
const applicationId = 'com.doji.exporeadprobe';
const run = (args:string[]) => execFileSync(adb, ['-s', serial, ...args], { encoding: 'utf8', timeout: 60000 });

async function main() {
  assert.equal(run(['emu', 'avd', 'name']).split('\n')[0]?.trim(), api30 ? 'DojiApiLab30' : 'DojiNetworkLab36', 'Dedicated AVD required');
  assert.equal(run(['shell', 'getprop', 'ro.build.version.sdk']).trim(), api30 ? '30' : '36');
  assert.equal(run(['shell', 'getprop', 'sys.boot_completed']).trim(), '1', 'AVD must finish booting');
  const manifest = execFileSync(aapt, ['dump', 'badging', apk], { encoding: 'utf8', timeout: 10000 });
  assert.ok(manifest.includes(`package: name='${applicationId}'`), 'Refusing member app or unknown APK');
  assert.ok(!manifest.includes('android.permission.INTERNET'), 'Refusing a probe with network permission');
  assert.ok(manifest.includes("versionName='local-only'"), 'Probe version marker required');
  const apkSha256 = createHash('sha256').update(readFileSync(apk)).digest('hex');
  run(['install', '-r', apk]);
  run(['shell', 'am', 'force-stop', applicationId]);
  let result:Record<string,unknown>|undefined;
  try {
    run(['shell', 'am', 'start', '-W', '-n', `${applicationId}/com.doit.challengeapp.MainActivity`]);
    for (let attempt = 0; attempt < 40; attempt++) {
      const pid = run(['shell', 'pidof', applicationId]).trim();
      assert.match(pid, /^\d+$/, 'Exactly one probe process required');
      const logs = run(['logcat', '-d', `--pid=${pid}`, '-s', 'ReactNativeJS:I']);
      const line = logs.split('\n').find(value => value.includes('DOJI_EXPO_READ_PROBE '));
      if (line) { const encoded=line.split('DOJI_EXPO_READ_PROBE ')[1];assert.ok(encoded);result = evidenceRecord(JSON.parse(encoded)); break; }
      await wait(1000);
    }
    assert.ok(result, 'No completion marker within bounded runtime');
    const at = new Date().toISOString();
    const directory = resolve('test-results/android-expo-read-probe');
    mkdirSync(directory, { recursive: true });
    const file = resolve(directory, `${at.replace(/[:.]/g, '-')}.json`);
    writeFileSync(file, JSON.stringify({ at, applicationId, api: api30 ? 30 : 36, apkSha256, internetPermission: false, ...result }, null, 2), { flag: 'wx' });
    console.log(JSON.stringify({ at, passed: result.passed, count: result.count, firebaseTestLab: result.firebaseTestLab, path: file }));
    assert.equal(result.passed, true, 'Offline Expo integration probe failed; inspect bounded evidence');
    assert.equal(result.count, 59, 'Require all native/JS/Sentry assertions');
    assert.equal(result.nativeBridgeMocked, false);
  } finally { run(['shell', 'am', 'force-stop', applicationId]); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
