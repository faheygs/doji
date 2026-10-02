// Deploy only the reviewed static admin directory into the existing Pages project.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='test-results/portal-editorial-release-20260927';
assert.equal(process.argv[2],'--deploy-reviewed-artifact');
const read=async p=>JSON.parse(await readFile(`${root}/${p}`,'utf8'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const site=await read('site-candidate.json');
const db=await read('database-verified.json');assert.equal(db.existingFunctionsAndGrantsPreserved,324);
const worker=await read('worker-released.json');assert.equal(worker.bindingsSettingsSchedulesPreserved,true);
async function inventory(dir,prefix=''){const list=[];for(const e of await readdir(dir,{withFileTypes:true}))list.push(...e.isDirectory()?await inventory(`${dir}/${e.name}`,prefix+e.name+'/'):[prefix+e.name]);return list;}
assert.deepEqual((await inventory(`${root}/site`)).sort(),site.assets.map(x=>x.path).sort());
for(const item of site.assets)assert.equal(hash(await readFile(`${root}/site/${item.path}`)),item.sha256,item.path);
assert.ok(!site.assets.some(x=>x.path.includes('_worker')||x.path.startsWith('functions/')));
const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);
const response=await fetch('https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09/pages/projects/doji-admin',{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});
assert.equal(response.status,200);const project=(await response.json()).result;
assert.equal(project.production_branch,'main');assert.equal(project.canonical_deployment.id,(await read('cloudflare-before.json')).pages.deploymentId,'Live Pages deployment drift');
await writeFile(`${root}/site-upload-started.json`,JSON.stringify({at:new Date().toISOString(),manifestHash:hash(JSON.stringify(site))}),{flag:'wx'});
const output=execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',`${root}/site`,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Reviewed isolated admin editorial workflows','--no-bundle'],{encoding:'utf8',timeout:120000,maxBuffer:1e6,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'04eab92db3126696f42644ede0943a09'}});
await writeFile(`${root}/site-upload-output.txt`,output,{flag:'wx'});console.log(output);
