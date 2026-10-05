import {spawn} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const workdir='D:/ChallengeApp/DoIt/test-results/media-storage-verify';
assert.ok(!existsSync(`${workdir}/supabase/.temp/project-ref`),'Must remain unlinked');
assert.match(readFileSync(`${workdir}/supabase/config.toml`,'utf8'),/project_id = "media-storage-verify"/);
const stop=process.argv[2]==='--stop';
assert.ok(process.argv.length===2||(process.argv.length===3&&stop));
const child=spawn(process.execPath,['node_modules/supabase/dist/supabase.js',stop?'stop':'start','--workdir',workdir,
 ...stop?[]:['--exclude','studio,imgproxy,edge-runtime,logflare,vector,supavisor,realtime,mailpit']],
 {env:{...process.env,PATH:`C:/Program Files/RedHat/Podman;${process.env.PATH}`},stdio:['ignore','pipe','pipe']});
// CLI success output contains synthetic keys. Never forward those keys to chat.
let errors='';child.stdout.resume();child.stderr.on('data',v=>{errors+=v;});
child.on('exit',code=>{if(code){console.error(errors.replace(/eyJ[A-Za-z0-9_.-]+/g,'[test token]').slice(-4500));process.exitCode=code;}
 else console.log(stop?'Synthetic media-storage-verify stack stopped; volumes preserved.':'Unlinked synthetic Storage test stack started; local API port 54431. No hosted project connected.');});
