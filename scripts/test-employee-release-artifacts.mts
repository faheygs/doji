import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac,webcrypto} from 'node:crypto';
import vm from 'node:vm';
const root='test-results/employee-access-release';
const context=vm.createContext({crypto:webcrypto,Request,Response,Headers,URL,TextEncoder,TextDecoder,AbortSignal,Buffer,
  atob,btoa,console,setTimeout,clearTimeout,performance});
const worker=new vm.SourceTextModule(await readFile(`${root}/worker-employee.js`,'utf8'),{context});
await worker.link(async name=>{assert.equal(name,'cloudflare:workers');return new vm.SyntheticModule(['DurableObject'],function(){this.setExport('DurableObject',class{});},{context});});
await worker.evaluate();
const env={SUPABASE_URL:'https://employee-local.test',SUPABASE_ANON_KEY:'local',SUPABASE_JWT_SECRET:'synthetic-only',
  ADMIN_PORTAL_EMPLOYEE_ACCOUNTS:'true',ADMIN_PORTAL_ORIGINS:'https://admin.dojipro.com'};
function request(path:string,role:string,aal='aal2',extra:Record<string,unknown>={}){
  const h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url');
  const p=Buffer.from(JSON.stringify({role,aal,sub:'11111111-1111-4111-8111-111111111111',iss:env.SUPABASE_URL+'/auth/v1',
    aud:'authenticated',exp:Math.floor(Date.now()/1000)+600,...extra})).toString('base64url');
  const sig=createHmac('sha256',env.SUPABASE_JWT_SECRET).update(`${h}.${p}`).digest('base64url');
  return new Request('https://worker.test'+path,{headers:{authorization:`Bearer ${h}.${p}.${sig}`,origin:'https://admin.dojipro.com'}});
}
const fetched:string[]=[];
context.fetch=async(url:RequestInfo|URL)=>{fetched.push(String(url));return Response.json({ok:true});};
const workerExports=worker.namespace as {default:{fetch(request:Request,env:Record<string,string>,context:{waitUntil():void}):Promise<Response>}};
const call=(req:Request)=>workerExports.default.fetch(req,env,{waitUntil(){}});
assert.equal((await call(request('/portal/admin/session','authenticated'))).status,401);
assert.equal((await call(request('/portal/admin/session','doji_employee','aal1'))).status,403);
assert.equal(fetched.length,0,'Denied identities never reach database');
assert.equal((await call(request('/portal/admin/session','doji_employee'))).status,200);
assert.ok(fetched.at(-1)?.endsWith('/get_admin_portal_session_v3'));
assert.equal((await call(request('/portal/admin/operators','doji_employee'))).status,200);
assert.ok(fetched.at(-1)?.endsWith('/get_admin_employee_directory_v1'));
for(const invalid of [{aud:'other'},{iss:'https://other.test/auth/v1'},{exp:1}])
  assert.equal((await call(request('/portal/admin/session','doji_employee','aal2',invalid))).status,401);
// Exercise the actual validator in its original member call site, without cloud reads.
const memberPath='/api/scale/profile';
// Source-level exact member wrapper plus unchanged remaining call site are release invariants.
const source=await readFile(`${root}/worker-employee.js`,'utf8');
assert.ok(source.includes('async function authenticateScaleReadRequest(request, env) {\n  return authenticateRole(request, env, "authenticated");'));
assert.equal((source.match(/const auth = await authenticateScaleReadRequest\(request, env\);/g)||[]).length,1);
const realtime=await readFile(`${root}/realtime-release/supabase/functions/realtime-token/index.ts`,'utf8');
const start=realtime.indexOf('  const capability: Record<string, string[]> =');
const end=realtime.indexOf('\n  try {',start);
const capability=new Function('adminRequest','userId','isAdmin','authorizedPostIds',
  realtime.slice(start,end).replace(': Record<string, string[]>','')+'\nreturn capability;');
assert.deepEqual(Object.keys(capability(true,'staff',true,[])).sort(),['doji:global','moderation:global']);
assert.deepEqual(Object.keys(capability(false,'member',false,['post-id'])).sort(),
  ['doji:global','feed:public','leaderboard:global','post:post-id','user:member:events']);
console.log('PASS: exact release Worker JWT/MFA/employee directory routing and admin/member realtime capability isolation.');
