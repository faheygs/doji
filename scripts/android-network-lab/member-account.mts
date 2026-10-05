// Owner-approved single synthetic member; no role grants, real email or admin login.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import {evidenceRecord,evidenceArray} from '../release-evidence.mts';
const root = resolve('.artifacts/android-member-test');
const path = resolve(root, 'credentials.json');
const ref = 'tvixsmqxotuvyjqzmjla';
const adb = resolve('.artifacts/android-tools/sdk/platform-tools/adb.exe');
const api30 = process.argv[2] === 'type' && process.argv[4] === '--api30';
const device = (...args:string[]) => execFileSync(adb, ['-s', api30 ? 'emulator-5582' : 'emulator-5580', ...args], { encoding: 'utf8', timeout: 30000, stdio: ['ignore','pipe','pipe'] });
(async () => {
  const mode = process.argv[2];
  if (mode === 'create') {
    assert.equal(process.argv[3], '--owner-approved');
    assert.equal(readFileSync('supabase/.temp/project-ref','utf8').trim(), ref);
    assert.ok(!existsSync(path), 'Preserve prior account; never duplicate an ambiguous creation');
    const keys = evidenceArray(evidenceRecord(JSON.parse(execFileSync(process.execPath, ['node_modules/supabase/dist/supabase.js', 'projects', 'api-keys', '--project-ref', ref, '--reveal', '--output-format', 'json'], { encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe'] }))).keys);
    const key = keys.find(k => k.type === 'secret' && k.name === 'default')?.api_key;
    assert.ok(typeof key==='string' && key.startsWith('sb_secret_'));
    const suffix = randomBytes(6).toString('hex');
    const record = { project: ref, synthetic: true, email: `doji-android-qa-${suffix}@test.invalid`,
      password: randomBytes(24).toString('hex') + 'Aa9', username: `androidqa_${suffix.slice(0,8)}`,
      displayName: 'Doji Android QA', createdAt: new Date().toISOString(), state: 'creation_started' };
    writeFileSync(path, JSON.stringify(record), {flag:'wx'});
    const client = createClient(`https://${ref}.supabase.co`, key, {auth:{persistSession:false, autoRefreshToken:false},
      global:{fetch:(url,init) => fetch(url,{...init,signal:AbortSignal.timeout(15000)})}});
    const {data,error} = await client.auth.admin.createUser({ email: record.email, password: record.password,
      email_confirm: true, app_metadata: { synthetic_qa: true, purpose: 'owner-approved-android25-network-test' },
      user_metadata: { birth_date: '2000-01-01', terms_version:'2026-08-20', privacy_version:'2026-08-20',
        terms_accepted_at:record.createdAt, privacy_accepted_at:record.createdAt } });
    if(error) throw new Error(`Test account creation failed (${error.status ?? 'unknown'}/${error.code ?? 'unknown'}); marker retained; do not retry blindly`);
    assert.ok(data.user?.id && data.user.email === record.email);
    Object.assign(record,{id:data.user.id,state:'created'});
    writeFileSync(path,JSON.stringify(record));
    console.log(JSON.stringify({created:true,synthetic:true,email:record.email,username:record.username,
      credentials:'owner-restricted ignored local file',confirmationEmailSent:false,rolesGranted:false}));
  } else if (mode === 'shorten-username') {
    const record=JSON.parse(readFileSync(path,'utf8')); assert.equal(record.state,'created');
    record.username=record.username.slice(0,20); writeFileSync(path,JSON.stringify(record));
    console.log(JSON.stringify({username:record.username}));
  } else if (mode === 'type') {
    const field = process.argv[3]; assert.ok(field && ['email','password','username'].includes(field));
    const record=evidenceRecord(JSON.parse(readFileSync(path,'utf8'))); assert.equal(record.state,'created');
    assert.equal(device('emu','avd','name').split('\n')[0]?.trim(), api30 ? 'DojiApiLab30' : 'DojiNetworkLab36');
    const value=record[field]; assert.ok(typeof value==='string' && /^[A-Za-z0-9_@.\-]+$/.test(value));
    device('shell','input','text',value);
    console.log(`Typed synthetic ${field} into the previously verified emulator field; value not logged.`);
  } else throw new Error('Use create --owner-approved or type email|password|username');
})().catch(e=>{ console.error(e instanceof assert.AssertionError ? e.message : (e.message.includes('Test account') ? e.message : 'Operation failed; no credentials logged. Inspect safely before retrying.')); process.exitCode=1; });
