import {setTimeout} from 'node:timers/promises';
import {errorOutput} from './contracts.mts';
// Only explicit preparation may download. Never swap images/digests or treat a
// failed pull as success. Authentication, missing manifests and other errors stop.
export async function pullWithRateLimitRetry(
  pull:()=>void|Promise<void>,
  wait:(ms:number)=>Promise<unknown>=(ms)=>setTimeout(ms),
  report:(message:string)=>void=console.warn,
) {
  const delays=[15000,30000,60000];
  for(let attempt=0;;attempt++){
    try {await pull();return;}
    catch(error){
      const output=errorOutput(error,'stderr')+'\n'+errorOutput(error,'stdout');
      if(!/toomanyrequests|too many requests|rate exceeded|\b429\b/i.test(output)||attempt>=delays.length)throw error;
      const delay=delays[attempt]!;
      report(`Public registry rate limit; retry ${attempt+1}/${delays.length} in ${delay/1000}s using the same image.`);
      await wait(delay);
    }
  }
}
