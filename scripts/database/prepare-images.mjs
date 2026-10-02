// Explicit opt-in downloads. Tests themselves never pull images or expose ports.
import { execFileSync } from 'node:child_process';
import { engine, image, authImage, storageImage, verifyLocalEngine } from './config.mjs';
verifyLocalEngine();
for (const target of [image, authImage, storageImage]) {
  execFileSync(engine, ['pull', target], { stdio: 'inherit', timeout: 300000 });
}
