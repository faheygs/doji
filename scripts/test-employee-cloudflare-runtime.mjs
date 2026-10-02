// Real local workerd, synthetic data, no provider or database access.
import assert from 'node:assert/strict';
import {Miniflare,convertV4MiniflareOptions} from '../infra/doji-orchestrator/node_modules/miniflare/dist/src/index.js';
import {build} from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
const bundled=await build({stdin:{resolveDir:process.cwd(),contents:`
 import {createEmployeeProxy} from './infra/portal-identity-candidate/employee-proxy.mjs';
 export default {async fetch(req){
  let diagnostic;try{diagnostic={signal:typeof req.signal,any:typeof AbortSignal.any,cookies:typeof new Headers().getSetCookie};new Request('https://example.test/',{redirect:'error'});}catch(e){diagnostic={runtimeError:e.message};}
  const proxy=createEmployeeProxy({enabled:true,origin:'https://admin.dojipro.com',endpoint:'https://abcdefghijklmnopqrst.supabase.co/functions/v1/employee-portal-v2',proxyKey:'ab'.repeat(32)},async(url,options)=>{new Request(url,options);return new Response(null,{status:401,headers:{'set-cookie':'__Host-doji_employee=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'}})});
  const result=await proxy(req);return Response.json({status:result.status,...diagnostic,cookies:result.headers.get('set-cookie')});
 }};`},bundle:true,write:false,format:'esm',platform:'neutral',external:['node:*']});
for(const flags of [['nodejs_compat'],['nodejs_compat','enable_request_signal']]){
 const mf=new Miniflare(convertV4MiniflareOptions({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-08-11',compatibilityFlags:flags,host:'127.0.0.1'}));
 try{
  const r=await mf.dispatchFetch('https://admin.dojipro.com/api/session',{headers:{origin:'https://admin.dojipro.com','cf-connecting-ip':'192.0.2.1'}});
  const result=await r.json();console.log(JSON.stringify({flags,...result}));
  if(flags.includes('enable_request_signal')){assert.equal(result.status,401);assert.ok(result.cookies?.includes('HttpOnly'));}
 }finally{await mf.dispose();}
}
