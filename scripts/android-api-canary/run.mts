import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
import { createHash } from 'node:crypto';
import {evidenceRecord,evidenceArray} from '../release-evidence.mts';
const root = path.resolve(import.meta.dirname, '../..');
const adb = path.join(root, '.artifacts/android-tools/sdk/platform-tools/adb.exe');
const serial = 'emulator-5582';
const pkg = 'com.doji.apicanary';
const apk = path.join(root, '.artifacts/android-api-canary/build/outputs/apk/release/app-release.apk');
function command(args:string[], input?:string) {
  const result = spawnSync(adb, ['-s', serial, ...args], { input, encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, 'Local emulator operation failed');
  return result.stdout.trim();
}
function verify() {
  assert.equal(command(['emu', 'avd', 'name']).split(/\r?\n/)[0]?.trim(), 'DojiApiLab30');
  assert.equal(command(['shell', 'getprop', 'ro.build.version.sdk']), '30');
  assert.equal(command(['shell', 'getprop', 'sys.boot_completed']), '1');
}
function start() {
  verify();
  const member = JSON.parse(fs.readFileSync(path.join(root, '.artifacts/android-member-test/credentials.json'), 'utf8'));
  assert.equal(member.synthetic, true); assert.equal(member.state, 'created');
  assert.equal(member.project, 'tvixsmqxotuvyjqzmjla');
  assert.match(member.email, /^doji-android-qa-[a-f0-9]+@test\.invalid$/);
  const env = parseEnv(fs.readFileSync(path.join(root, '.env.local'), 'utf8'));
  assert.equal(env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, ''), 'https://tvixsmqxotuvyjqzmjla.supabase.co');
  const key = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const payload=key?.split('.')[1];assert.ok(payload);
  assert.equal(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')).role, 'anon');
  // Private stdin, not command arguments, logcat, source or APK assets.
  command(['shell', 'run-as', pkg, 'mkdir', '-p', 'files']);
  assert.equal(command(['shell', 'run-as', pkg, 'sh', '-c', '"test ! -e files/result.json && test ! -e files/canary.json && echo clean"']), 'clean');
  command(['shell', 'run-as', pkg, 'sh', '-c', '"umask 077; cat > files/canary.json"'], JSON.stringify({ member, key }));
  command(['shell', 'am', 'start', '-n', `${pkg}/com.doit.challengeapp.MainActivity`]);
  console.log('Canary started on verified API 30 emulator; no credentials printed.');
}
function collect() {
  verify();
  const data = evidenceRecord(JSON.parse(command(['exec-out', 'run-as', pkg, 'cat', 'files/result.json'])));
  assert.equal(data.api, 30); assert.ok(Array.isArray(data.results) && data.results.length <= 37);
  const results=evidenceArray(data.results).map(row=>{assert.ok(typeof row.totalMs==='number' && typeof row.ok==='boolean');return {...row,totalMs:row.totalMs,ok:row.ok};});
  assert.equal(command(['shell', 'run-as', pkg, 'sh', '-c', '"test ! -e files/canary.json && echo removed"']), 'removed');
  const output = path.join(root, 'test-results/member-api-audit', `android-api30-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify({ ...data, applicationId: pkg,
    apkSha256: createHash('sha256').update(fs.readFileSync(apk)).digest('hex') }, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ output, tested: results.length, failures: results.filter(r => !r.ok),
    minMs: Math.min(...results.map(r => r.totalMs)), maxMs: Math.max(...results.map(r => r.totalMs)) }));
  command(['shell', 'am', 'force-stop', pkg]);
}
try {
  assert.equal(process.argv.length, 3);
  if (process.argv[2] === '--start') start();
  else if (process.argv[2] === '--collect') collect();
  else throw new Error('Unknown mode');
} catch { console.error('Canary setup/collection stopped; inspect non-sensitive emulator status.'); process.exitCode = 1; }
