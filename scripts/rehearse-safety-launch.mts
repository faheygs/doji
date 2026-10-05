import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {root,hash,save} from './prepare-safety-launch.mts';
import { offlineContainer, errorOutput } from './database/contracts.mts';
import { evidenceRecord, evidenceStrings, releaseBaseline } from './release-evidence.mts';
const podman='C:/Program Files/RedHat/Podman/podman.exe',container='supabase_db_employee-cutover-verify';
const info=offlineContainer(JSON.parse(execFileSync(podman,['inspect',container],{encoding:'utf8'})));
assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
const artifact=evidenceRecord(JSON.parse(await readFile(`${root}/database-artifact.json`,'utf8')));
const before=releaseBaseline(JSON.parse(await readFile(`${root}/database-before.json`,'utf8')));
const sql=await readFile(`${root}/database.sql`,'utf8');assert.equal(hash(sql),artifact.sha256);
const evidence=(await readFile('supabase/migrations/20260927020000_employee_case_evidence.sql','utf8')).replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const baseline=evidenceStrings(artifact.changed).map(s=>{const definition=(before.functions[s]??before.functions[`public.${s}`])?.definition;assert.ok(typeof definition==='string','Missing exact rollback definition');return definition;}).join(';\n');
const probe=`begin;do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic isolated DB required';end if;end$$;\n${evidence}\n${baseline};\n${sql.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'')}\nrollback;`;
try{
 execFileSync(podman,['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:probe,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:6e6});
 await save('database-rehearsed.json',{at:new Date().toISOString(),sha256:artifact.sha256,offline:true,rolledBack:true,allDraftsTogether:true,liveTargetDefinitions:true,existingGrantsPoliciesFunctionsPreserved:true});
 console.log('Full guarded release SQL rehearsed together and rolled back against synthetic schema with exact live target definitions.');
}catch(e){console.error(errorOutput(e,'stderr'));process.exitCode=1;}
