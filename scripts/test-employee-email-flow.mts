// Synthetic local-only registration, branded mail and actual Auth confirmation/MFA.
// Provider delivery is intercepted: no external email, no hosted keys or data.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,createHmac} from 'node:crypto';
import {writeFile,mkdir} from 'node:fs/promises';
import {registerEmployee} from '../supabase/functions/_shared/employee-registration.ts';
import {signInEmployee} from '../supabase/functions/_shared/employee-signin.ts';
import {workdir} from './employee-test-runtime.mts';
import {evidenceRecord,evidenceAt,evidenceText,evidenceArray} from './release-evidence.mts';
const cli='C:/Users/gfahe/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const config=JSON.parse(execFileSync(cli,['status','--workdir',workdir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:`C:/Program Files/RedHat/Podman;${process.env.PATH}`}}));
assert.equal(config.API_URL,'http://127.0.0.1:54321');
const health=await(await fetch(`${config.API_URL}/auth/v1/health`)).json();
assert.equal(health.version,'v2.197.0','Test exact production Auth version');
const env={enabled:true,origin:'http://127.0.0.1:3000',supabaseUrl:evidenceText(evidenceRecord(config).API_URL),anonKey:evidenceText(evidenceRecord(config).ANON_KEY),serviceKey:evidenceText(evidenceRecord(config).SERVICE_ROLE_KEY),resendKey:'local-intercept-only',fromEmail:'Doji <work@test.invalid>'};
const deliveries:{html:string;text:string}[]=[];
const upstream:typeof fetch=async(input,options)=>{
  const url=input instanceof Request?input.url:String(input);
  if(url==='https://api.resend.com/emails') {const mail=evidenceRecord(JSON.parse(evidenceText(options?.body)));deliveries.push({html:evidenceText(mail.html),text:evidenceText(mail.text)});return Response.json({id:'local-only'});}
  assert.equal(new URL(url).origin,config.API_URL,'Never contact an external service');
  const response=await fetch(url,options);
  if(!response.ok) console.log('Local upstream status',new URL(url).pathname,response.status);
  if(String(url).includes('/admin/generate_link')) {
    const data=await response.clone().json();
    const action=data.action_link?new URL(data.action_link):null;
    console.log('Local generated-link contract',JSON.stringify({role:data.role,kind:data.verification_type,hasHash:!!data.hashed_token,origin:action?.origin,path:action?.pathname,redirect:action?.searchParams.get('redirect_to')}));
  }
  return response;
};
const req=(body:unknown)=>new Request('http://localhost/employee',{method:'POST',headers:{origin:env.origin,'content-type':'application/json'},body:JSON.stringify(body)});
function auth(path:'logout?scope=local',body:unknown,token?:string):Promise<unknown>;
function auth(path:string,body:unknown,token?:string):Promise<Record<string,unknown>>;
async function auth(path:string,body:unknown,token=env.anonKey):Promise<unknown>{
  const result=await fetch(`${config.API_URL}/auth/v1/${path}`,{method:'POST',headers:{apikey:config.ANON_KEY,authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
  const data=await result.json().catch(()=>null);
  assert.ok(result.ok,`${path.split('?')[0]} HTTP ${result.status}: ${data?.msg||data?.message||''}`);return path==='logout?scope=local'?data:evidenceRecord(data);
}
function totp(secret:string){
  const bits=[...secret.replace(/=+$/,'')].map(c=>'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'.indexOf(c).toString(2).padStart(5,'0')).join('');
  const octets=bits.match(/.{8}/g);assert.ok(octets);const key=Buffer.from(octets.map(b=>parseInt(b,2)));
  const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const hash=createHmac('sha1',key).update(counter).digest();return String((hash.readUInt32BE(hash[19]!&15)&0x7fffffff)%1000000).padStart(6,'0');
}
const suffix=randomUUID().slice(0,8),email=`design-${suffix}@test.invalid`,password=`Local-only-${randomUUID()}!`;
// Baseline separate member session, with the real member age metadata contract.
const member=await auth('admin/users',{email:`member-${suffix}@test.invalid`,password,email_confirm:true,user_metadata:{birth_date:'2000-01-01'}},config.SERVICE_ROLE_KEY);
const memberSession=await auth('token?grant_type=password',{email:member.email,password});
const created=await registerEmployee(req({displayName:'Local email test',email,password}),env,upstream);
assert.equal(created.status,202,await created.text());assert.equal(deliveries.length,1);
const first=deliveries[0];assert.ok(first);assert.match(first.html,/Good work starts here/);assert.ok(first.text.includes('/employee-setup/'));
await mkdir('test-results/employee-email-preview',{recursive:true});
// Synthetic link only; never store production confirmation links.
await writeFile('test-results/employee-email-preview/verification.html',first.html);
const resent=await registerEmployee(req({action:'resend_verification',email}),env,upstream);
assert.equal(resent.status,202);assert.equal(deliveries.length,2);
const second=deliveries[1];assert.ok(second);const link=second.text.match(/http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^\s]+/)?.[0];assert.ok(link);
const verified=await auth('verify',{token_hash:new URL(link).searchParams.get('token'),type:'signup'});
assert.equal(evidenceAt(verified,'user').role,'doji_employee');
const signed=await signInEmployee(req({email,password}),env,upstream);assert.equal(signed.status,200);
const session=await signed.json();
const enrolled=await auth('factors',{factor_type:'totp',friendly_name:`Local ${suffix}`,issuer:'Doji Work'},session.access_token);
const challenge=await auth(`factors/${enrolled.id}/challenge`,{},session.access_token);
const secured=await auth(`factors/${enrolled.id}/verify`,{challenge_id:challenge.id,code:totp(evidenceText(evidenceAt(enrolled,'totp').secret))},session.access_token);
const claims=evidenceRecord(JSON.parse(Buffer.from(evidenceText(evidenceText(secured.access_token).split('.')[1]),'base64url').toString('utf8')));
assert.equal(claims.aal,'aal2');assert.equal(claims.role,'doji_employee');
await auth('logout?scope=local',{},evidenceText(secured.access_token));
const refreshedMember=await auth('token?grant_type=refresh_token',{refresh_token:memberSession.refresh_token});
assert.equal(evidenceAt(refreshedMember,'user').id,member.id,'Separate member session survives employee verification/MFA/logout');
const loginAgain=await signInEmployee(req({email,password}),env,upstream);assert.equal(loginAgain.status,200);
const returning=evidenceRecord(await loginAgain.json());assert.ok(evidenceArray(evidenceAt(returning,'user').factors).some(f=>f.status==='verified'));
await auth('logout?scope=local',{},evidenceText(returning.access_token));
const before=deliveries.length;
await registerEmployee(req({action:'resend_verification',email:member.email}),env,upstream);
assert.equal(deliveries.length,before,'Member resend cannot send employee mail');
console.log('PASS: Auth 2.197.0 actual employee registration → branded email → resend → verification → password → MFA → local logout → existing authenticator. Separate member refresh survived; member email untouched. No external email sent.');
