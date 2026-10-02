import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHmac,webcrypto} from 'node:crypto';
import vm from 'node:vm';
const editorial=process.argv.includes('--editorial');
const retriage=process.argv.includes('--retriage');
const root=retriage?'test-results/idea-retriage-release-20260927':editorial?'test-results/portal-editorial-release-20260927':'test-results/portal-triage-release-20260927';
const source=await readFile(`${root}/worker-candidate.js`,'utf8');
const patch=JSON.parse(await readFile(`${root}/worker-patch.json`,'utf8'));
if(retriage)assert.equal(source.replace(patch.replacement,patch.anchor),(await readFile(`${root}/worker-baseline.js`,'utf8')).replaceAll('\r\n','\n'));
else assert.equal(source.replace(patch.addition,'').replace(patch.guard,''),(await readFile(`${root}/live-index.js`,'utf8')).replaceAll('\r\n','\n'));
const context=vm.createContext({crypto:webcrypto,Request,Response,Headers,URL,TextEncoder,TextDecoder,AbortSignal,Buffer,atob,btoa,console,setTimeout,clearTimeout,performance});
const worker=new vm.SourceTextModule(source,{context});
await worker.link(async name=>{assert.equal(name,'cloudflare:workers');return new vm.SyntheticModule(['DurableObject'],function(){this.setExport('DurableObject',class{});},{context});});
await worker.evaluate();
const env={SUPABASE_URL:'https://employee-local.test',SUPABASE_ANON_KEY:'local',SUPABASE_JWT_SECRET:'synthetic-only',ADMIN_PORTAL_EMPLOYEE_ACCOUNTS:'true',ADMIN_PORTAL_ORIGINS:'https://admin.dojipro.com'};
function request(path,role='doji_employee',aal='aal2',extra={}){
 const h=Buffer.from(JSON.stringify({alg:'HS256'})).toString('base64url');
 const p=Buffer.from(JSON.stringify({role,aal,sub:'11111111-1111-4111-8111-111111111111',iss:env.SUPABASE_URL+'/auth/v1',aud:'authenticated',exp:Math.floor(Date.now()/1000)+600,...extra})).toString('base64url');
 const sig=createHmac('sha256',env.SUPABASE_JWT_SECRET).update(`${h}.${p}`).digest('base64url');
 return new Request('https://worker.test'+path,{headers:{authorization:`Bearer ${h}.${p}.${sig}`,origin:'https://admin.dojipro.com'}});
}
const fetched=[];context.fetch=async(url,init)=>{fetched.push({url:String(url),init});return Response.json({ok:true});};
const call=req=>worker.namespace.default.fetch(req,env,{waitUntil(){}});
const id='22222222-2222-4222-8222-222222222222';
for(const [route,rpc,arg] of [['report-case-v3','get_admin_report_case_v3','p_report_id'],['appeal-case','get_admin_appeal_case_v1','p_appeal_id']]){
 const path=`/portal/admin/${route}?id=${id}`;
 for(const [role,aal,status] of [['authenticated','aal2',401],['doji_employee','aal1',403]]){
   const n=fetched.length;assert.equal((await call(request(path,role,aal))).status,status);assert.equal(fetched.length,n);
 }
 for(const extra of [{aud:'other'},{iss:'https://other.test/auth/v1'},{exp:1}])assert.equal((await call(request(path,'doji_employee','aal2',extra))).status,401);
 assert.equal((await call(request(path))).status,200);
 assert.ok(fetched.at(-1).url.endsWith('/'+rpc));assert.deepEqual(JSON.parse(fetched.at(-1).init.body),{[arg]:id});
 assert.equal((await call(request(path+'&id='+id))).status,400);
 assert.equal((await call(request(`/portal/admin/${route}?id=bad`))).status,400);
 env.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS='false';assert.equal((await call(request(path))).status,403);env.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS='true';
}
assert.equal((await call(request(`/portal/admin/report-case?id=${id}`))).status,200);
assert.ok(fetched.at(-1).url.endsWith('/get_admin_report_case_v2'));
if(editorial||retriage){
 for(const path of ['/portal/admin/editorial-page?kind=announcements','/portal/admin/editorial-item?kind=suggestions&id='+id]){
  for(const [role,aal,status] of [['authenticated','aal2',401],['doji_employee','aal1',403]]){
   const n=fetched.length;assert.equal((await call(request(path,role,aal))).status,status);assert.equal(fetched.length,n);
  }
  assert.equal((await call(request(path))).status,200);
  env.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS='false';assert.equal((await call(request(path))).status,403);env.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS='true';
 }
 assert.equal((await call(request('/portal/admin/editorial-page?kind=announcements&limit=51'))).status,400);
 assert.equal((await call(request('/portal/admin/editorial-item?kind=suggestions&id=bad'))).status,400);
 assert.equal((await call(request('/portal/admin/editorial-page?kind=suggestions&filter=draft'))).status,400);
 const path='/portal/admin/editorial-command';
 const body={kind:'suggestions',action:'approved',id,version:'a'.repeat(32),input:{},reason:'Reviewed exact options',idempotencyKey:'editorial-test-key'};
 const post=(role='doji_employee',aal='aal2')=>new Request(request(path,role,aal),{method:'POST',headers:{...Object.fromEntries(request(path,role,aal).headers),'content-type':'application/json'},body:JSON.stringify(body)});
 for(const [role,aal,status] of [['authenticated','aal2',401],['doji_employee','aal1',403]]){const n=fetched.length;assert.equal((await call(post(role,aal))).status,status);assert.equal(fetched.length,n);}
 assert.equal((await call(post())).status,200);
 assert.ok(fetched.at(-1).url.endsWith('/admin_editorial_command_v1'));
 assert.deepEqual(JSON.parse(fetched.at(-1).init.body),{p_kind:body.kind,p_action:body.action,p_id:id,p_version:body.version,p_input:{},p_reason:body.reason,p_idempotency_key:body.idempotencyKey});
 assert.ok(fetched.at(-1).init.headers.Authorization||fetched.at(-1).init.headers.authorization,'Caller authorization forwarded');
 if(retriage){
   body.action='pending';assert.equal((await call(post())).status,200);
   assert.equal(JSON.parse(fetched.at(-1).init.body).p_action,'pending');
   body.kind='announcements';assert.equal((await call(post())).status,400);
   body.kind='suggestions';body.action='delete';assert.equal((await call(post())).status,400);
 }
 console.log('PASS additive editorial artifact: bounded reads, role/MFA/flag/input denials, exact command mapping, caller authorization.');
}
console.log('PASS exact Worker artifact: unchanged existing code, employee-only routes, MFA/JWT/input denial, original route preserved.');
