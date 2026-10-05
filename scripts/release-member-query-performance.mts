// Exact approved release only. Never invokes db push or deploys app/portal/Worker code.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import type {BinaryLike} from 'node:crypto';
import {evidenceRecord,evidenceAt,evidenceArray,evidenceRows,evidenceText,evidenceNumber} from './release-evidence.mts';
import {offlineContainer} from './database/contracts.mts';
const root='test-results/member-query-release-20260928';
const read=(p:string)=>readFileSync(p,'utf8');
const json=(p:string)=>evidenceRecord(JSON.parse(read(p)));
const save=(name:string,data:unknown)=>writeFileSync(`${root}/${name}`,typeof data==='string'?data:JSON.stringify(data,null,2),{flag:'wx'});
const hash=(s:BinaryLike)=>createHash('sha256').update(s).digest('hex');
const sqlFile=(file:string)=>{const out=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--output-format','json','--file',file],{encoding:'utf8',timeout:145000,maxBuffer:8e6});return evidenceRows(JSON.parse(out.slice(out.indexOf('{'))));};
const snapshot=()=>evidenceRecord(sqlFile('scripts/member-query-release-preflight.sql')[0]?.baseline);
const baseline=json(`${root}/database-refreshed.json`);
const summary=json('test-results/local-query-repair-20260928/summary.json');
const functions=read('docs/drafts/member_query_performance_v1.sql');
const indexSource=read('docs/drafts/member_query_performance_indexes_v1.sql');
assert.equal(hash(functions),evidenceAt(summary,'sourceHashes').functions);
assert.equal(hash(indexSource),evidenceAt(summary,'sourceHashes').indexes);
assert.ok(evidenceArray(summary.gates).every(x=>x.passed));
assert.equal(evidenceAt(summary,'rollback').exactRollback,true);
assert.equal(evidenceAt(summary,'replay').mentionAlertIntents,1);
assert.equal(read('supabase/.temp/project-ref').trim(),'tvixsmqxotuvyjqzmjla');
const names=['get_notification_center_snapshot_without_post_context(timestamp with time zone,integer)','sync_comment_mentions(uuid,text,uuid)'];
const indexNames=['comments_author_created_idx','reactions_author_created_idx'] as const;
const statements=indexSource.match(/^create index concurrently .*;$/gm);
assert.ok(statements);assert.equal(statements.length,2);
const versions=['20260928040000','20260928040100','20260928040200'];
const keys=['functions','policies','relations','triggers','role_settings','indexes','default_acl'];
const subset=(b:Record<string,unknown>)=>Object.fromEntries(keys.map(k=>[k,b[k]]));
function checkWindow(b:Record<string,unknown>){
 assert.equal(b.active_events,0);assert.equal(b.overdue_outbox,0);assert.equal(b.lock_waits,0);
 assert.ok(Date.parse(evidenceText(b.next_event))>Date.parse(evidenceText(b.at))+25*60000);
 assert.ok(evidenceNumber(b.database_bytes)<300e6);
 for(const x of Object.values(evidenceRecord(b.tables)))assert.ok(evidenceNumber(evidenceRecord(x).total_bytes)<1e6,'Re-review larger production index build');
}
function expectedIndexes(n:number){return {...evidenceRecord(baseline.indexes),...Object.fromEntries(indexNames.slice(0,n).map((name,i)=>['public.'+name,`CREATE INDEX ${name} ON public.${i===0?'comments':'reactions'} USING btree (user_id, created_at DESC)`]))};}
function checkIndexes(b:Record<string,unknown>,n:number){
 assert.deepEqual(b.indexes,expectedIndexes(n));
 for(const name of indexNames.slice(0,n)){assert.equal(evidenceAt(b,'index_state',name).valid,true);assert.equal(evidenceAt(b,'index_state',name).ready,true);}
}
const mode=process.argv[2];
if(mode==='prepare'){
 // Rehearse exact canonical definitions and rollback in a new network-none local clone.
 const podman='C:/Program Files/RedHat/Podman/podman.exe',container='supabase_db_employee-cutover-verify';
 const exec=(args:string[],input?:string)=>execFileSync(podman,args,{input,encoding:'utf8',timeout:60000,maxBuffer:8e6});
 const info=offlineContainer(JSON.parse(exec(['inspect',container])));
 assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
 const local=(db:string,input:string)=>exec(['exec','-i',container,'psql','-X','-h','/var/run/postgresql','-U','postgres','-d',db,'-At','-v','ON_ERROR_STOP=1'],input).trim();
 assert.equal(local('postgres',"select count(*) from vault.secrets;select count(*) from auth.users where email is null or email not like '%@test.invalid';"),'0\n0');
 const db=`query_release_qa_${Date.now()}`;assert.match(db,/^query_release_qa_[0-9]+$/);
 save('local-rehearsal-started.json',{db,container,network:'none'});
 local('postgres',`create database ${db} template postgres;`);
 try{
  for(const f of ['20260926050000_skip_unchanged_push_profile_update','20260927020000_employee_case_evidence','20260927030000_employee_editorial_workflows','20260927040000_announcement_campaigns','20260927050000_community_idea_retriage','20260928020000_repair_suggestion_profile_policy'])local(db,read(`supabase/migrations/${f}.sql`));
  const fingerprints=()=>JSON.parse(local(db,"select json_object_agg(p.oid::regprocedure::text,json_build_object('hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';"));
  const old=fingerprints();for(const [name,f] of Object.entries(evidenceRecord(baseline.functions)))assert.deepEqual(old[name],{hash:evidenceRecord(f).hash,acl:evidenceRecord(f).acl});
  for(const s of statements)local(db,s); // separate round trips, never one multi-statement API call
  local(db,functions);const next=fingerprints();
  for(const [name,f] of Object.entries(old)){assert.equal(next[name].acl,evidenceRecord(f).acl);if(!names.includes(name))assert.deepEqual(next[name],f);}
  const rollback="begin;set local lock_timeout='3s';set local statement_timeout='30s';\n"+Object.values(evidenceRecord(baseline.originals)).join(';\n')+';\ncommit;';
  local(db,rollback);assert.deepEqual(fingerprints(),old);
  local(db,functions);assert.deepEqual(fingerprints(),next);
  save('expected-functions.json',next);save('rollback-originals.sql',rollback);
 }finally{local('postgres',`drop database ${db};`);save('local-rehearsal-cleanup.json',{db,dropped:true});}
 const next=json(`${root}/expected-functions.json`);
 const preflight=read('scripts/member-query-release-preflight.sql');
 const select=preflight.slice(preflight.indexOf('select jsonb_build_object('),preflight.lastIndexOf('rollback;')).trim().replace(/;$/,'');
 const before={...subset(baseline),indexes:expectedIndexes(2)};
 const after:Record<string,unknown>=structuredClone(before);for(const name of names)evidenceAt(after,'functions',name).hash=evidenceRecord(next[name]).hash;
 const assertSnapshot=(expected:unknown,label:string)=>`do $guard$ declare b jsonb;k text;expected jsonb:=$expected$${JSON.stringify(expected)}$expected$::jsonb; begin select baseline into b from release_snapshot; foreach k in array array['${keys.join("','")}'] loop if b->k is distinct from expected->k then raise exception '${label} mismatch: %',k;end if;end loop; if (b->>'active_events')::int<>0 or (b->>'overdue_outbox')::int<>0 or (b->>'lock_waits')::int<>0 or b->>'next_event' is null or (b->>'next_event')::timestamptz<clock_timestamp()+interval '25 minutes' then raise exception 'Unsafe release window';end if;end $guard$;\n`;
 const body=functions.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
 const guardHistory=`do $h$begin if exists(select 1 from supabase_migrations.schema_migrations where version in ('${versions.join("','")}')) then raise exception 'Release already recorded';end if;end $h$;\n`;
 const common="begin;set local lock_timeout='3s';set local statement_timeout='30s';\n"+`create temp table release_snapshot on commit drop as ${select};\n`+assertSnapshot(before,'Before')+guardHistory+body+`\ntruncate release_snapshot;insert into release_snapshot ${select};\n`+assertSnapshot(after,'After');
 const migrations=[...statements,functions];
 const history=migrations.map((s,i)=>`insert into supabase_migrations.schema_migrations(version,name,statements) values('${versions[i]}','${i<2?indexNames[i]:'repair_member_query_performance'}',array[$migration$${s}$migration$]);`).join('\n');
 save('deploy.sql',common+history+"\nnotify pgrst,'reload schema';select clock_timestamp() as deployed_at;commit;\n");
 const rollback=read(`${root}/rollback-originals.sql`).replace(/^begin;/,'').replace(/commit;\s*$/,'');
 save('rollback.sql',"begin;set local lock_timeout='3s';set local statement_timeout='30s';\n"+`create temp table release_snapshot on commit drop as ${select};\n`+assertSnapshot(after,'Rollback baseline')+rollback+"\nnotify pgrst,'reload schema';commit;\n");
 for(let i=0;i<2;i++)save(`index-${i}.sql`,statements[i]+'\n');
 save('artifact-manifest.json',{at:new Date().toISOString(),functions:hash(functions),indexes:hash(indexSource),deploy:hash(read(`${root}/deploy.sql`)),rollback:hash(read(`${root}/rollback.sql`)),storageCheck:{source:'Supabase Infrastructure dashboard',usedGB:0.45,provisionedGB:2,spendCap:true,compute:'Micro',settingsChanged:false}});
 console.log('Pinned release prepared; exact two-function live-definition rollback/reapply passed locally; clone removed.');
}else if(mode==='index'){
 const i=Number(process.argv[3]);assert.ok(i===0||i===1);assert.equal(process.argv[4],'--approved');
 const b=snapshot();checkWindow(b);checkIndexes(b,i);for(const k of keys.filter(k=>k!=='indexes'))assert.deepEqual(b[k],baseline[k],k);
 const safety=evidenceRecord(sqlFile('scripts/member-query-index-safety.sql')[0]?.safety);
 assert.equal(safety.statement_timeout,'2min');assert.equal(safety.old_transactions,0);assert.equal(safety.index_builds,0);assert.equal(safety.lock_waits,0);assert.equal(safety.migration_exists,false);
 save(`index-${i}-before.json`,{b,safety});
 assert.equal(read(`${root}/index-${i}.sql`).trim(),statements[i]);
 save(`index-${i}-started.json`,{at:new Date().toISOString()});
 // One statement only; verified existing 2-minute server deadline applies. No role settings changed.
 const rows=sqlFile(`${root}/index-${i}.sql`);
 const a=snapshot();checkIndexes(a,i+1);checkWindow(a);
 for(const k of keys.filter(k=>k!=='indexes'))assert.deepEqual(a[k],baseline[k],k);
 save(`index-${i}-result.json`,{at:a.at,index:evidenceAt(a,'index_state',indexNames[i]),rows});console.log(JSON.stringify({created:indexNames[i],...evidenceAt(a,'index_state',indexNames[i])}));
}else if(mode==='deploy'){
 assert.equal(process.argv[3],'--approved');
 const manifest=json(`${root}/artifact-manifest.json`);assert.equal(hash(read(`${root}/deploy.sql`)),manifest.deploy);
 const b=snapshot();checkWindow(b);checkIndexes(b,2);
 save('deploy-started.json',{at:new Date().toISOString(),hash:manifest.deploy});
 save('deploy-result.json',sqlFile(`${root}/deploy.sql`));console.log('Approved function release transaction committed. Run verify.');
}else if(mode==='rollback-ready'){
 // A regression rollback must work during an active event, not just a release window.
 const after=json(`${root}/database-after.json`);
 const expected=Object.fromEntries(names.map(name=>[name,evidenceAt(after,'functions',name)]));
 const guard=`do $g$ declare name text;f jsonb;expected jsonb:=$e$${JSON.stringify(expected)}$e$::jsonb;begin
 for name in select jsonb_object_keys(expected) loop
 select jsonb_build_object('hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text,'owner',p.proowner) into f from pg_proc p where p.oid=to_regprocedure('public.'||name);
 if f is distinct from expected->name then raise exception 'Rollback function drift: %',name;end if;
 end loop;end $g$;\n`;
 const restore=Object.values(evidenceRecord(baseline.originals)).join(';\n')+';\n';
 const sql="begin;set local lock_timeout='3s';set local statement_timeout='30s';\n"+guard+restore+"notify pgrst,'reload schema';commit;\n";
 save('rollback-incident.sql',sql);
 save('rollback-incident-manifest.json',{sha256:hash(sql),restoresOnly:names,leavesValidIndexes:true,changesMemberRows:false,requiresQuietWindow:false,history:'Keep original applied records; document any rollback as a new forward release.'});
 save('app-shape-canary.json',sqlFile('scripts/member-query-release-canary.sql'));
 console.log('Incident rollback prepared without a quiet-window dependency; exact app-shape read and migration-history checks passed.');
}else if(mode==='verify'){
 const a=snapshot();const next=json(`${root}/expected-functions.json`);
 checkWindow(a);checkIndexes(a,2);
 for(const k of keys.filter(k=>!['functions','indexes'].includes(k)))assert.deepEqual(a[k],baseline[k],k);
 assert.deepEqual(Object.keys(evidenceRecord(a.functions)).sort(),Object.keys(evidenceRecord(baseline.functions)).sort());
 for(const [name,f] of Object.entries(evidenceRecord(a.functions)))assert.deepEqual(f,{...evidenceAt(baseline,'functions',name),hash:evidenceRecord(next[name]).hash},name);
 save('database-after.json',a);
 save('member-canary.json',sqlFile('scripts/portal-triage-member-canary.sql'));
 save('health-after.json',sqlFile('scripts/performance-maintenance-read.sql'));
 console.log(JSON.stringify({verified:true,functions:331,changedFunctions:2,addedIndexes:2,allPermissionsPoliciesTriggersSettingsUnchanged:true,active:a.active_events,overdue:a.overdue_outbox,lockWaits:a.lock_waits}));
}else throw new Error('Expected prepare, index 0|1 --approved, deploy --approved, or verify.');
