// Read-only capture of the current Worker, storing source but never OAuth/secrets.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import { evidenceRecord } from './release-evidence.mts';
const token=(await readFile('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml','utf8')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];
assert.ok(token,'Existing Wrangler authentication required');
const root='https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09/workers/scripts/doji-orchestrator';
const out='test-results/employee-access-release';
await mkdir(out,{recursive:true});
async function get(path: string){const r=await fetch(root+path,{headers:{authorization:`Bearer ${token}`}});assert.ok(r.ok,`Cloudflare read ${r.status}`);return r;}
const response=await get('/content/v2');
const form=await response.formData();
const modules=[];
for(const [name,file] of form){
  if(typeof file==='string') {console.log('Worker metadata field',name);continue;}
  assert.ok(/^[\w.-]+$/.test(file.name));
  await writeFile(`${out}/live-${file.name}`,Buffer.from(await file.arrayBuffer()));
  modules.push({field:name,file:file.name,type:file.type});
}
const settings=evidenceRecord(evidenceRecord(await (await get('/settings')).json()).result);
assert.ok(settings.bindings==null || Array.isArray(settings.bindings));
const bindings=(settings.bindings??[]).map(evidenceRecord);
// secret_text bindings returned by the provider contain names only. Explicitly
// keep only nonsensitive configuration and reject unexpected secret values.
for(const binding of bindings) if(binding.type==='secret_text') assert.equal(binding.text,undefined);
await writeFile(`${out}/worker-settings.json`,JSON.stringify(settings,null,2));
await writeFile(`${out}/worker-modules.json`,JSON.stringify(modules,null,2));
console.log('Captured current Worker modules:',modules.map(m=>m.file).join(', '));
console.log('Captured binding types/names only:',bindings.map(b=>`${b.type}:${b.name}`).join(', '));
