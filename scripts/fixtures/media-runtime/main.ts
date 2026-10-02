// Local-only Edge supervisor. No environment, credentials or network forwarded.
Deno.serve(async request => {
 const worker = await EdgeRuntime.userWorkers.create({
  servicePath:'/verify/worker',memoryLimitMb:256,workerTimeoutMs:60000,
  noModuleCache:false,envVars:[],forceCreate:true,
  cpuTimeSoftLimitMs:1800,cpuTimeHardLimitMs:2000,
 });
 try { return await worker.fetch(request); }
 catch (error) { return Response.json({error:String(error)},{status:500}); }
});
setTimeout(async()=>{
 try {
  const response=await fetch('http://127.0.0.1:9000/test',{method:'POST',signal:AbortSignal.timeout(60000)});
  console.log('MEDIA_RUNTIME_RESULT '+JSON.stringify({status:response.status,body:await response.json()}));
 }catch(error){console.log('MEDIA_RUNTIME_RESULT '+JSON.stringify({status:500,body:{error:String(error)}}));}
},1000);
