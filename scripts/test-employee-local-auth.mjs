// Local synthetic Auth/REST test. Captures keys in memory; never prints tokens,
// passwords, MFA secrets or email links. No hosted fallback is allowed.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID, createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { container, workdir } from './employee-test-runtime.mjs';

const podman = 'C:/Program Files/RedHat/Podman/podman.exe';
const cli = 'C:/Users/gfahe/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const status = JSON.parse(execFileSync(cli, ['status','--workdir',workdir,'--output','json'],
  {encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:`C:/Program Files/RedHat/Podman;${process.env.PATH}`}}));
const base = status.API_URL;
assert.equal(base,'http://127.0.0.1:54321','Local-only API');
const newClient = () => createClient(base,status.ANON_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
function sql(source) {
  return execFileSync(podman,['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],
    {input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
}
function good(result,label) { assert.equal(result.error,null,`${label}: ${result.error?.message}`); return result.data; }
const claims = token => JSON.parse(Buffer.from(token.split('.')[1],'base64url').toString());
const employeeSession = (session,label) => { assert.equal(claims(session.access_token).role,'doji_employee',label); return session; };
const suffix = randomUUID().slice(0,8);
const email = `employee-${suffix}@test.invalid`, password = `Local-only-${randomUUID()}!`;
const memberEmail = `member-${suffix}@test.invalid`, memberPassword = `Local-only-${randomUUID()}!`;
const employee = newClient(), member = newClient();
assert.equal(sql('select count(*) from vault.secrets;'),'0','No production outbound credentials in test DB');
// The foundation was installed before the resend recovery was added. Apply
// only that additive definition locally; never substitute this for migration.
if(sql("select to_regprocedure('public.claim_employee_verification_v1(text)') is null;")==='t') {
  const foundation=readFileSync('docs/drafts/20260926010000_employee_identity_foundation.sql','utf8');
  const start=foundation.indexOf('create function public.claim_employee_verification_v1(');
  const end=foundation.indexOf('-- Bootstrap',start);
  assert.ok(start>0 && end>start);
  sql(`begin;\n${foundation.slice(start,end)}\ncommit;\nnotify pgrst, 'reload schema';`);
}
async function auth(path, body, service=false) {
  const response = await fetch(`${base}/auth/v1/${path}`,{method:'POST',headers:{apikey:status.ANON_KEY,
    authorization:`Bearer ${service?status.SERVICE_ROLE_KEY:status.ANON_KEY}`,'content-type':'application/json'},body:JSON.stringify(body)});
  return {status:response.status,body:await response.json()};
}
async function emailToken(address,type) {
  // Mailpit exists only on loopback. Read only the randomly generated test recipient.
  for (let attempt=0;attempt<20;attempt++) {
    const list = await (await fetch('http://127.0.0.1:54324/api/v1/messages')).json();
    for (const item of list.messages??[]) {
      if (!item.To?.some(to=>to.Address===address)) continue;
      const mail = await (await fetch(`http://127.0.0.1:54324/api/v1/message/${item.ID}`)).json();
      const links = (mail.Text??'').match(/https?:\/\/[^\s<>]+/g)??[];
      for(const link of links) {
        const url = new URL(link);
        if(url.origin!==base || url.searchParams.get('type')!==type) continue;
        return url.searchParams.get('token');
      }
    }
    await new Promise(resolve=>setTimeout(resolve,150));
  }
  assert.fail(`No ${type} email received by the synthetic local inbox`);
}
function totp(secret) {
  const bits = [...secret.replace(/=+$/,'').toUpperCase()].map(ch=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(ch).toString(2).padStart(5,'0')).join('');
  const key = Buffer.from(bits.match(/.{8}/g).map(byte=>parseInt(byte,2)));
  const counter=Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const hash=createHmac('sha1',key).update(counter).digest(); const offset=hash[19]&15;
  return String((hash.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0');
}

// Prove the real hook is configured: a member signup without a DOB must fail.
const badMember = await member.auth.signUp({email:`missing-dob-${suffix}@test.invalid`,password:memberPassword});
assert.ok(badMember.error,'Existing member age hook active');
assert.match(badMember.error.message,/birthday/);
console.log('PASS: member age hook still rejects missing birthday');
const created=await auth('admin/users',{email,password,role:'doji_employee',email_confirm:false,
  app_metadata:{account_type:'employee'},user_metadata:{display_name:'Local employee test'}},true);
assert.equal(created.status,200,`Admin employee creation: ${created.body.msg??created.body.message??created.body.code}`);
assert.equal(created.body.role,'doji_employee');
assert.equal(created.body.email_confirmed_at,undefined);
const id=created.body.id;
assert.equal(sql(`select count(*) from public.profiles where id='${id}';`),'0');
console.log('PASS: Auth Admin creates an unconfirmed employee without a member profile or invented DOB');
assert.ok((await employee.auth.signInWithPassword({email,password})).error,'Unconfirmed employee cannot log in');
good(await employee.auth.resend({type:'signup',email,options:{emailRedirectTo:'http://localhost:3000/'}}),'Send employee verification');
const confirmed=good(await employee.auth.verifyOtp({token_hash:await emailToken(email,'signup'),type:'signup'}),'Confirm employee email');
employeeSession(confirmed.session,'Email confirmation preserves role');
employeeSession(good(await employee.auth.signInWithPassword({email,password}),'Employee login').session,'Password login preserves role');
const pending=good(await employee.rpc('get_employee_registration_status_v1'),'Pending employee registration');
assert.equal(pending.status,'pending');
assert.ok((await employee.from('profiles').select('id').limit(1)).error,'Employee cannot read member profiles');
assert.ok((await employee.rpc('get_admin_portal_session')).error,'Pending employee cannot enter portal');
employeeSession(good(await employee.auth.refreshSession(),'Employee refresh').session,'Refresh preserves role');
console.log('PASS: confirmation, login, refresh, pending approval and member-data denial');

// Real member signup uses a synthetic member birthday (never used for employees).
good(await member.auth.signUp({email:memberEmail,password:memberPassword,options:{data:{birth_date:'2000-01-01'}}}),'Member signup');
good(await member.auth.verifyOtp({token_hash:await emailToken(memberEmail,'signup'),type:'signup'}),'Member email confirmation');
const memberSession=good(await member.auth.getSession(),'Member session').session;
assert.equal(claims(memberSession.access_token).role,'authenticated');
assert.ok((await member.rpc('get_employee_registration_status_v1')).error,'Member denied employee registration RPC');
console.log('PASS: existing member signup and confirmation retain member role');

good(await employee.auth.resetPasswordForEmail(email,{redirectTo:'http://localhost:3000/'}),'Employee password recovery');
const recovered=good(await employee.auth.verifyOtp({token_hash:await emailToken(email,'recovery'),type:'recovery'}),'Employee recovery verification');
employeeSession(recovered.session,'Password recovery preserves employee role');
const replacement=`Local-only-${randomUUID()}!`;
good(await employee.auth.updateUser({password:replacement}),'Update recovered password');
employeeSession(good(await employee.auth.signInWithPassword({email,password:replacement}),'Recovered employee login').session,'Recovered login preserves role');
const factor=good(await employee.auth.mfa.enroll({factorType:'totp',friendlyName:`Local test ${suffix}`}), 'MFA enrollment');
const challenge=good(await employee.auth.mfa.challenge({factorId:factor.id}),'MFA challenge');
const verified=good(await employee.auth.mfa.verify({factorId:factor.id,challengeId:challenge.id,code:totp(factor.totp.secret)}),'MFA verify');
assert.equal(claims(verified.access_token).role,'doji_employee');
assert.equal(claims(verified.access_token).aal,'aal2');
assert.ok((await employee.rpc('get_admin_portal_session')).error,'MFA alone does not approve employee');
console.log('PASS: recovery, password change and verified MFA preserve employee isolation');

// Bootstrap is deliberately service-only, against this synthetic local UUID.
if (process.env.DOJI_ENROLLMENT_ONLY !== 'true') {
const service=createClient(base,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
good(await service.rpc('bootstrap_employee_owner_v1',{p_employee_id:id,p_reason:'Local synthetic employee release test'}),'Local owner bootstrap');
for(const rpc of ['get_admin_portal_session_v3','get_admin_command_center_snapshot_v2',
  'get_admin_work_queue_page_v1','get_admin_resolved_reports_page_v1','get_admin_audit_page_v2',
  'get_admin_audit_export_v1','get_admin_event_health_history_v1','get_admin_operational_health_read_v1',
  'get_admin_appeals_snapshot','get_admin_realtime_token_capabilities','get_admin_employee_directory_v1']) {
  good(await employee.rpc(rpc),`Synthetic approved employee read: ${rpc}`);
}
assert.equal(sql('select employee_only from public.admin_employee_cutover;'),'f');
console.log('PASS: approved AAL2 employee can call 11 real portal read RPCs; cutover remains off');
} else {
  assert.equal(sql("select to_regclass('public.admin_employee_cutover') is null;"),'t');
  assert.equal(sql("select count(*) from public.admin_employees where status<>'pending' or cardinality(roles)>0;"),'0');
  console.log('PASS: enrollment-only release grants no administrator access or cutover');
}

good(await employee.auth.signOut({scope:'local'}),'Employee local logout');
assert.equal(good(await member.auth.getUser(memberSession.access_token),'Member token after employee logout').user.email,memberEmail);
assert.equal(claims(good(await member.auth.refreshSession(),'Member refresh after employee logout').session.access_token).role,'authenticated');
console.log('PASS: employee recovery/MFA/logout leave separate member session valid');
console.log('Local Auth flow passed; no real email, production account, production owner grant or cutover performed. Hosted/device checks remain required.');
