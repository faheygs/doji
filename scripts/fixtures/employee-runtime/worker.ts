// Network-disabled real Edge runtime probe; all credentials and I/O are synthetic.
import pg from '../../../infra/portal-identity-candidate/node_modules/pg/lib/index.js';
import {createEmployeeRuntime} from '../../../infra/portal-identity-candidate/employee-runtime.mjs';
import {createEmployeeProxy} from '../../../infra/portal-identity-candidate/employee-proxy.mjs';
const config={enabled:true,realm:'employee',origin:'https://admin.dojipro.com',
 endpoint:'https://abcdefghijklmnopqrst.supabase.co/functions/v1/employee-portal-v2',storageOrigin:'https://abcdefghijklmnopqrst.supabase.co',
 proxyKey:'ab'.repeat(32),clientId:'client_synthetic',apiKey:'sk_synthetic'+'x'.repeat(32),
 encryptionKey:'bc'.repeat(32),admissionKey:'cd'.repeat(32),
 database:{host:'aws-0-test.pooler.supabase.com',port:6543,database:'postgres',projectRef:'abcdefghijklmnopqrst',username:'doji_employee_portal_login.abcdefghijklmnopqrst',password:'x'.repeat(40)}};
Deno.serve(async()=>{
 let providerCalls=0,sqlCalls=0,signCalls=0;
 const ensure=(condition:unknown,label:string)=>{if(!condition)throw Error(label);};
 try{
  // Load the actual driver too; no socket or real credential is supplied.
  const driver=new pg.Client({host:'127.0.0.1',port:1,ssl:{rejectUnauthorized:true}});
  // pg's resolved connection parameters are internal, not part of @types/pg.
  // Inspect them defensively rather than casting the driver to an untyped value.
  const parameters='connectionParameters' in driver ? driver.connectionParameters : null;
  const ssl=parameters && typeof parameters==='object' && 'ssl' in parameters ? parameters.ssl : null;
  ensure(ssl && typeof ssl==='object' && 'rejectUnauthorized' in ssl && ssl.rejectUnauthorized===true,'driver TLS');
  const runtime=createEmployeeRuntime(config,{
    createClient:()=>({connect:async()=>{},end:async()=>{},query:async(query:unknown)=>{
      sqlCalls++;
      if(typeof query==='string' && query.startsWith('select session_user'))return {rows:[{login:'doji_employee_portal_login',current_role:'doji_employee_portal_login',privileged:false,inherits:false,permitted:true}]};
      return {rows:typeof query==='object'?[{result:false}]:[]};
    }}),
    signStorage:()=>{signCalls++;throw Error('No signing expected');},
    signRealtime:()=>{signCalls++;throw Error('No signing expected');},
    upstream:()=>{providerCalls++;throw Error('No provider call expected');},
  });
  const proxy=createEmployeeProxy(config,(url:string,init:RequestInit)=>runtime(new Request(url,init)));
  const headers={origin:config.origin,'sec-fetch-site':'same-origin','cf-connecting-ip':'192.0.2.3','content-type':'application/json'};
  const signedOut=await proxy(new Request(config.origin+'/api/session',{headers}));
  ensure(signedOut.status===401,'missing cookie');
  ensure(sqlCalls===0 && providerCalls===0,'anonymous has no upstream reads');
  const denied=await proxy(new Request(config.origin+'/auth/start',{method:'POST',headers,body:JSON.stringify({email:'employee@example.test',password:'synthetic-only-password'})}));
  ensure(denied.status===429,'durable admission denies');
  ensure(providerCalls===0 && signCalls===0,'denied admission precedes provider/signing');
  const direct=await runtime(new Request(config.endpoint+'/api/session',{headers}));
  ensure(direct.status===403,'direct Edge bypass denied');
  return Response.json({passed:true,driverLoaded:true,anonymousStatus:signedOut.status,throttledStatus:denied.status,directStatus:direct.status,providerCalls,signCalls,sqlCalls});
 }catch(error){return Response.json({passed:false,error:String(error)},{status:500});}
});
