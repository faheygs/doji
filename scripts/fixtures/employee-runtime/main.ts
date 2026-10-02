Deno.serve(async request=>{
 const worker=await EdgeRuntime.userWorkers.create({servicePath:'/verify/worker',memoryLimitMb:256,workerTimeoutMs:20000,noModuleCache:false,envVars:[],forceCreate:true,cpuTimeSoftLimitMs:1800,cpuTimeHardLimitMs:2000});
 try{return await worker.fetch(request);}catch(error){return Response.json({error:String(error)},{status:500});}
});
setTimeout(async()=>{
 try{
  const response=await fetch('http://127.0.0.1:9000/test',{signal:AbortSignal.timeout(25000)});
  console.log('EMPLOYEE_RUNTIME_RESULT '+JSON.stringify({status:response.status,body:await response.json()}));
 }catch(error){console.log('EMPLOYEE_RUNTIME_RESULT '+JSON.stringify({status:500,body:{error:String(error)}}));}
},500);
