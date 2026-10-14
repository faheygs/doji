import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { createBusinessMailHandler } from '../infra/business-email/hosted.mts';
import { createBusinessMailSql } from '../infra/business-email/restricted-sql.mts';
const config={enabled:true,setupEnabled:true,clientId:'client_business',workosKey:'sk_'+'w'.repeat(24),resendKey:'re_'+'r'.repeat(24),from:'business@mail.dojipro.com',signingKey:'a'.repeat(64),allowedRecipient:'owner@test.invalid'};
const id='11000000-0000-4000-8000-000000000001',nonce='11000000-0000-4000-8000-000000000002';
const now=1791760000000,expires=Math.floor(now/1000)+120;
const signed=()=>({id,nonce,expires,signature:createHmac('sha256',config.signingKey).update(`${id}|${nonce}|${expires}`).digest('hex')});
const request=(body:unknown,headers:Record<string,string>={})=>new Request('https://test.invalid/functions/v1/business-application-mail',{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});
test('unsigned, tampered, expired, oversized and browser-origin requests never query SQL',async()=>{
 let queries=0;const run=createBusinessMailHandler(config,async()=>{queries++;return null;},fetch,()=>now);
 for(const body of [{}, {...signed(),signature:'b'.repeat(64)}, {...signed(),expires:expires-121}, {...signed(),expires:expires+10}, {...signed(),extra:true}, {data:'x'.repeat(1000)}]) assert.notEqual((await run(request(body))).status,200);
 assert.equal((await run(request(signed(),{origin:'https://business.dojipro.com'}))).status,404);
 assert.equal(queries,0);
});
test('valid wakeup claims only the signed exact job and repeated empty claim does no provider I/O',async()=>{
 let n=0;const run=createBusinessMailHandler(config,async(q,p)=>{n++;assert.match(q,/claim_application_email\(\$1::uuid,\$2::uuid\)/);assert.deepEqual(p,[id,nonce]);return null;},async()=>{throw Error('Unexpected network');},()=>now);
 assert.deepEqual(await (await run(request(signed()))).json(),{state:'idle'});
 assert.deepEqual(await (await run(request(signed()))).json(),{state:'idle'});assert.equal(n,2);
});
test('disabled entrypoint performs no SQL or provider work',async()=>{
 const run=createBusinessMailHandler({...config,enabled:false},async()=>{throw Error('Unexpected SQL');},fetch,()=>now);
 assert.equal((await run(request(signed()))).status,503);
});
test('signed wakeup works without a Node-global Buffer in the hosted runtime',async()=>{
 const run=createBusinessMailHandler(config,async()=>null,fetch,()=>now);
 const input=request(signed());const original=Object.getOwnPropertyDescriptor(globalThis,'Buffer');
 let response:Response;
 try {
  Reflect.deleteProperty(globalThis,'Buffer');
  response=await run(input);
 } finally {if(original)Object.defineProperty(globalThis,'Buffer',original);}
 assert.deepEqual(await response.json(),{state:'idle'});
});
test('acceptance recipient restriction cancels before authorization or send',async()=>{
 const calls:string[]=[];
 const run=createBusinessMailHandler(config,async(q,p)=>{calls.push(q);if(q.includes('claim_'))return {id,lease_token:nonce,application_id:id,kind:'approve',subject:'user_test',issuer:'https://api.workos.com/user_management/client_business',audience:'client_business'};assert.equal(p[2],'cancelled');return null;},async(url)=>{assert.match(url,/api.workos.com/);return Response.json({id:'user_test',email:'other@test.invalid',email_verified:true});},()=>now);
 assert.deepEqual(await (await run(request(signed()))).json(),{state:'cancelled'});assert.equal(calls.length,2);
});
test('mail transport rejects portal login and arbitrary SQL before opening sockets',async()=>{
 const db={host:'aws-0-us-west-2.pooler.supabase.com',port:6543,database:'postgres',projectRef:'tvixsmqxotuvyjqzmjla',username:'doji_business_mail_login.tvixsmqxotuvyjqzmjla',password:'p'.repeat(40),ca:'-----BEGIN CERTIFICATE-----test'};
 const create=()=>{throw Error('Socket must not open');};
 assert.throws(()=>createBusinessMailSql({...db,username:'doji_business_portal_login.tvixsmqxotuvyjqzmjla'},create));
 const sql=createBusinessMailSql(db,create);
 await assert.rejects(sql('select * from auth.users',[]));
 await assert.rejects(sql('select business_private.claim_application_email() as result',[]));
});
