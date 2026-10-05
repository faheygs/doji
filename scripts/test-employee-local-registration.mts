// Actual registration handler against loopback Auth/REST and intercepted Resend.
// Test-only addresses; no hosted keys, owner bootstrap or external email delivery.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { registerEmployee } from '../supabase/functions/_shared/employee-registration.ts';
import { workdir } from './employee-test-runtime.mts';
import {evidenceRecord} from './release-evidence.mts';
const cli='C:/Users/gfahe/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const status=evidenceRecord(JSON.parse(execFileSync(cli,['status','--workdir',workdir,'--output','json'],
 {encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:`C:/Program Files/RedHat/Podman;${process.env.PATH}`}})));
assert.ok(typeof status.API_URL==='string' && typeof status.ANON_KEY==='string' && typeof status.SERVICE_ROLE_KEY==='string');
assert.equal(status.API_URL,'http://127.0.0.1:54321');
const env={enabled:true,origin:'http://127.0.0.1:3000',supabaseUrl:status.API_URL,anonKey:status.ANON_KEY,serviceKey:status.SERVICE_ROLE_KEY,resendKey:'local-intercept-only',fromEmail:'Doji <work@test.invalid>'};
const email=`recovery-${randomUUID().slice(0,8)}@test.invalid`;
const request=(body:unknown)=>new Request(`${status.API_URL}/functions/v1/employee-register`,{method:'POST',
 headers:{origin:env.origin,'content-type':'application/json'},body:JSON.stringify(body)});
const registration=await registerEmployee(request({email,displayName:'Local recovery test',password:`Local-only-${randomUUID()}!`}),env,
 async(url,options)=>url==='https://api.resend.com/emails'?Response.json({},{status:503}):fetch(url,options));
assert.equal(registration.status,503,'Simulated initial mail outage leaves recoverable registration');
assert.match((await registration.json()).message,/Resend verification email/);
let upstreamCalls:string[]=[]; const emails:{to:string[];html:string}[]=[];
const tracked:typeof fetch=async(url,options)=>{upstreamCalls.push(String(url));if(url==='https://api.resend.com/emails'){assert.ok(typeof options?.body==='string');const mail=evidenceRecord(JSON.parse(options.body));assert.ok(Array.isArray(mail.to) && mail.to.every((value:unknown)=>typeof value==='string') && typeof mail.html==='string');emails.push({to:mail.to,html:mail.html});return Response.json({id:'local-only'});}return fetch(url,options);};
const recovered=await registerEmployee(request({action:'resend_verification',email}),env,tracked);
assert.equal(recovered.status,202);
assert.ok(upstreamCalls.some(url=>url.includes('/auth/v1/admin/generate_link')),'Allowed unconfirmed employee receives retry');
assert.ok(emails.some(mail=>mail.to.includes(email)&&mail.html.includes('Good work starts here')),'Branded verification reaches intercepted provider only');
upstreamCalls=[];
const unknown=await registerEmployee(request({action:'resend_verification',email:`unknown-${randomUUID().slice(0,8)}@test.invalid`}),env,tracked);
assert.equal(unknown.status,202);
assert.equal(upstreamCalls.length,1,'Unknown address never reaches Auth/email');
assert.deepEqual(await unknown.json(),await recovered.json(),'No identity disclosure in response');
console.log('PASS: actual local registration handler recovers initial mail failure through bounded employee-only resend; unknown addresses send no email. Production untouched.');
