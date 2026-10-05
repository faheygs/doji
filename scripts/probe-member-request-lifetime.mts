// Offline diagnostic: real request/gateway/feed modules, installed RN abort
// polyfill, fake transport/timers. No network, credentials or Sentry delivery.
import * as fs from 'node:fs';
import * as vm from 'node:vm';
import * as path from 'node:path';
import assert from 'node:assert/strict';
import ts from 'typescript';
import {AbortController as NativeAbortController} from 'abort-controller';

function load<T>(relative:string,imports:Record<string,unknown>,globals:Record<string,unknown>={}):T {
  const filename=path.resolve(import.meta.dirname,'..',relative);
  const output=ts.transpileModule(fs.readFileSync(filename,'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:filename,
  }).outputText;
  const exports={};
  vm.runInNewContext(output,{
    exports,require:(id:string)=>{if(!(id in imports))throw Error('Unexpected dependency: '+id);return imports[id];},
    AbortController:NativeAbortController,URLSearchParams,Error,...globals,
  },{filename});
  return exports as T;
}
type ProbeSignal=InstanceType<typeof NativeAbortController>['signal'];
function currentSignal(transport:{childSignal?:ProbeSignal}):ProbeSignal|undefined{return transport.childSignal;}
type Gateway={readThroughScaleGateway(path:string,direct:()=>Promise<unknown>,signal?:ProbeSignal):Promise<unknown>};
type Feed={fetchFeedPostsPage(context:{userId:string;dailyEventId:string;audience:string;unlocked:boolean},page:{offset:number},signal:ProbeSignal):Promise<unknown>};
async function main(){
  const timers=new Set<()=>void>();
  const diagnostics={beginReadDiagnostics(){},finishReadDiagnostics(){},inheritReadDiagnostics(){}};
  const awaitRead=load('./lib/awaitReadSignal.ts',{});
  const rpcError=load('./lib/rpcQueryError.ts',{'./memberReadDiagnostics':diagnostics});
  const request=load('./lib/requestSignal.ts',{
    './rpcQueryError':rpcError,'./awaitReadSignal':awaitRead,'./memberReadDiagnostics':diagnostics,
  },{
    setTimeout(fn:()=>void){timers.add(fn);return fn;},clearTimeout(fn:()=>void){timers.delete(fn);},
  });
  const transport:{childSignal?:ProbeSignal;release?:()=>void}={};
  const observedMemberFetch=(_url:string,{signal}:{signal:ProbeSignal})=>new Promise((_resolve,reject)=>{
    transport.childSignal=signal;
    const abort=()=>reject(Object.assign(new Error('Aborted'),{name:'AbortError'}));
    signal.addEventListener('abort',abort);
    transport.release=()=>{signal.removeEventListener('abort',abort);};
  });
  const gateway=load<Gateway>('lib/scaleReadGateway.ts',{
    './supabase':{supabase:{auth:{getSession:async()=>({data:{session:{access_token:'offline-fixture'}}})}}},
    './requestSignal':request,'./rpcQueryError':rpcError,'./awaitReadSignal':awaitRead,
    './memberReadDiagnostics':{...diagnostics,observedMemberFetch},
  },{process:{env:{EXPO_PUBLIC_SCALE_READ_URL:'https://offline.invalid'}}});
  const pending=gateway.readThroughScaleGateway('/fixture',async()=>{throw Error('No direct fallback');});
  await new Promise<void>(resolve=>{setImmediate(resolve);});
  assert.equal(timers.size,1);
  for(const timer of [...timers])timer();
  let reason:unknown;
  await pending.catch(error=>{reason=error;});
  assert.ok(reason instanceof Error);assert.equal(reason.name,'TimeoutError');
  transport.release?.();
  assert.equal(timers.size,0);
  const feed=load<Feed>('lib/feedQueries.ts',{
    './supabase':{supabase:{}},'./runMemberRead':{runMemberRead(){throw Error('No direct fallback');}},
    './scaleReadGateway':gateway,
  });
  const feedResults=[];
  for(const unlocked of [false,true]){
    transport.childSignal=undefined;
    const parent=new NativeAbortController();
    const result=feed.fetchFeedPostsPage({userId:'fixture',dailyEventId:'fixture',audience:'everyone',unlocked},{offset:0},parent.signal);
    await new Promise<void>(resolve=>{setImmediate(resolve);});
    const activeDeadlinesWhilePending:number=timers.size;
    const signal=currentSignal(transport);
    assert.ok(signal);
    parent.abort();
    const parentCancellationReachedTransport=signal.aborted;
    await assert.rejects(result,{name:'AbortError'});
    transport.release?.();
    assert.equal(activeDeadlinesWhilePending,1);assert.equal(parentCancellationReachedTransport,true);assert.equal(timers.size,0);
    feedResults.push({unlocked,activeDeadlinesWhilePending,parentCancellationReachedTransport});
  }
  console.log(JSON.stringify({runtime:'installed React Native AbortController polyfill',gatewayDeadline:{rejected:true,rejectsWithError:true,name:reason.name},feedRequests:feedResults},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
