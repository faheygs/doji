// Explicit opt-in downloads. Tests themselves never pull images or expose ports.
import { execFileSync } from 'node:child_process';
import { engine, image, authImage, storageImage, verifyLocalEngine } from './config.mts';
import {pullWithRateLimitRetry} from './image-pull-retry.mts';
verifyLocalEngine();
for (const target of [image, authImage, storageImage]) {
  await pullWithRateLimitRetry(()=>{
    const output=execFileSync(engine, ['pull', target], { encoding:'utf8', stdio:['ignore','pipe','pipe'], timeout:300000, maxBuffer:4*1024*1024 });
    process.stdout.write(output);
  });
}
