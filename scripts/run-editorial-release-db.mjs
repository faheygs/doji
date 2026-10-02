// Explicit scoped action; never run a broad migration push or retry uncertain commits.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root='test-results/portal-editorial-release-20260927';
const mode=process.argv[2];assert.ok(['member-before','member-after','rehearsal','deploy'].includes(mode));
assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),'tvixsmqxotuvyjqzmjla');
const file=mode.startsWith('member-')?'scripts/portal-triage-member-canary.sql':`${root}/${mode}.sql`;
const source=await readFile(file,'utf8');
const hash=createHash('sha256').update(source).digest('hex');
if(mode==='deploy'){
 const rehearsal=JSON.parse(await readFile(`${root}/rehearsal-result.json`,'utf8'));
 const rehearsed=await readFile(`${root}/rehearsal.sql`,'utf8');
 assert.equal(rehearsal.sha256,createHash('sha256').update(rehearsed).digest('hex'));
 assert.equal(source.slice(0,source.indexOf('insert into supabase_migrations.schema_migrations')),rehearsed.slice(0,rehearsed.indexOf('-- Disable frontend feature')),'Only ledger/commit differs from rehearsed body');
 await writeFile(`${root}/database-deploy-started.json`,JSON.stringify({at:new Date().toISOString(),sha256:hash}),{flag:'wx'});
}
const raw=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--output-format','json','--file',file],{encoding:'utf8',timeout:30000,maxBuffer:2e6});
const result=JSON.parse(raw.slice(raw.indexOf('{')));
const receipt={at:new Date().toISOString(),sha256:hash,rows:result.rows};
await writeFile(`${root}/${mode}-result.json`,JSON.stringify(receipt,null,2),{flag:'wx'});
console.log(JSON.stringify(receipt,null,2));
