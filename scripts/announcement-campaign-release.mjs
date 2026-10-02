// Explicit, narrowly scoped release. No broad migration push, Worker upload or campaign publication.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const root='test-results/announcement-campaign-release-20260927';
const prior='test-results/portal-editorial-release-20260927';
const version='20260927040000';
const changed=['admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)','submit_challenge_suggestion(text,text,text,jsonb,text)','claim_active_app_announcement()'];
const helper='complete_announcement_idea_v1(uuid)';
const addedIndexes=['public.announcement_one_enabled_window','public.app_announcement_completions_pkey','public.announcement_completions_member_idx'];
const read=async p=>(await readFile(p,'utf8')).replaceAll('\r\n','\n');
const json=async p=>JSON.parse(await read(p));
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(name,data)=>writeFile(`${root}/${name}`,typeof data==='string'?data:JSON.stringify(data,null,2),{flag:'wx'});
const omit=(v,keys)=>Object.fromEntries(Object.entries(v).filter(([k])=>!keys.includes(k)));
const array=xs=>`array[${xs.map(x=>`'${x}'`).join(',')}]`;
const body=s=>s.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const query=file=>{const out=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--output-format','json','--file',file],{encoding:'utf8',timeout:30000,maxBuffer:4e6});return JSON.parse(out.slice(out.indexOf('{'))).rows;};
const mode=process.argv[2];
assert.ok(['capture-db','capture-cloud','prepare-db','rehearsal','deploy-db','verify-db','prepare-site','deploy-site','verify-live'].includes(mode));
assert.equal((await read('supabase/.temp/project-ref')).trim(),'tvixsmqxotuvyjqzmjla');
await mkdir(root,{recursive:true});
async function api(path){const token=(await read('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);const r=await fetch('https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09'+path,{headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(15000)});assert.ok(r.ok,`${path}: ${r.status}`);return r;}
async function cloud(){
 const settings=(await (await api('/workers/scripts/doji-orchestrator/settings')).json()).result;
 for(const b of settings.bindings??[])if(b.type==='secret_text')assert.equal(b.text,undefined);
 const form=await (await api('/workers/scripts/doji-orchestrator/content/v2')).formData();
 const modules=[];for(const [field,file] of form)if(typeof file!=='string')modules.push({field,name:file.name,sha256:hash(Buffer.from(await file.arrayBuffer()))});
 const schedules=(await (await api('/workers/scripts/doji-orchestrator/schedules')).json()).result;
 const deployments=(await (await api('/workers/scripts/doji-orchestrator/deployments')).json()).result;
 const p=(await (await api('/pages/projects/doji-admin')).json()).result;
 return {settings,modules,schedules,deployments,pages:{id:p.canonical_deployment?.id,url:p.canonical_deployment?.url,branch:p.production_branch}};
}
async function inventory(dir,prefix=''){const out=[];for(const e of await readdir(dir,{withFileTypes:true}))out.push(...e.isDirectory()?await inventory(`${dir}/${e.name}`,prefix+e.name+'/'):[prefix+e.name]);return out;}
if(mode==='capture-db'){
 let sql=await read('scripts/portal-editorial-preflight.sql');
 sql=sql.replace("'captured_at',clock_timestamp(),",`'captured_at',clock_timestamp(),
 'server_version',current_setting('server_version'),
 'announcements_enabled',(select count(*) from public.app_announcements where enabled),
 'ledger_rows',(select count(*) from public.spark_ledger),
 'ledger_bytes',pg_total_relation_size('public.spark_ledger'),
 'campaign_exists',to_regclass('public.app_announcement_completions') is not null,
 'campaign_migration_exists',exists(select 1 from supabase_migrations.schema_migrations where version='${version}'),
 'constraints',(select jsonb_object_agg(c.conrelid::regclass::text||'.'||c.conname,pg_get_constraintdef(c.oid)) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','storage')),
 'announcement_columns',(select jsonb_agg(jsonb_build_array(attname,atttypid::regtype::text,attnotnull) order by attnum) from pg_attribute where attrelid='public.app_announcements'::regclass and attnum>0 and not attisdropped),`);
 await save('preflight.sql',sql);
 const b=query(`${root}/preflight.sql`)[0].baseline;
 await save('database-before.json',b);
 const p=await json(`${prior}/database-after.json`);
 for(const k of ['functions','policies','relations','triggers','role_settings','indexes','default_acl'])assert.deepEqual(b[k],p[k],`Baseline drift: ${k}`);
 assert.ok(b.server_version.startsWith('17.'));
 console.log(JSON.stringify({at:b.captured_at,version:b.server_version,functions:Object.keys(b.functions).length,tables:b.editorial_tables,ledgerRows:b.ledger_rows,ledgerBytes:b.ledger_bytes,enabled:b.announcements_enabled,nextEvent:b.next_event,active:b.active_events,overdue:b.overdue_outbox,locks:b.lock_waits},null,2));
} else if(mode==='capture-cloud'){
 const c=await cloud();await save('cloud-before.json',c);
 assert.equal(c.pages.id,'f57b2692-26a6-4bf3-99fd-7a9f797b5189');
 assert.equal(c.modules.find(x=>x.name==='index.js')?.sha256,'c618cf1a99e3f0660ff84be28d986de44e4ddded89134ae0e12964651b931e1a');
 console.log(JSON.stringify({pages:c.pages,modules:c.modules,schedules:c.schedules}));
} else if(mode==='prepare-db'){
 const b=await json(`${root}/database-before.json`);
 assert.equal(b.campaign_exists,false);assert.equal(b.campaign_migration_exists,false);
 assert.equal(b.editorial_tables.announcements.rows,0);assert.ok(b.ledger_rows<10000&&b.ledger_bytes<8*1024*1024);
 const raw=await read(`${root}/preflight.sql`);
 const snapshot=raw.slice(raw.indexOf('select jsonb_build_object('),raw.lastIndexOf('rollback;')).trim().replace(/;$/,'');
 const capture=name=>`create temporary table ${name} on commit drop as ${snapshot};\n`;
 const keys=['functions','policies','relations','triggers','role_settings','indexes','default_acl','constraints','announcement_columns'];
 const base=JSON.stringify(Object.fromEntries(keys.map(k=>[k,b[k]])));
 const guard=`do $gate$ declare b jsonb; k text; expected jsonb:=$base$${base}$base$::jsonb;begin
 select baseline into b from campaign_before;
 foreach k in array ${array(keys)} loop if b->k is distinct from expected->k then raise exception 'Baseline drift: %',k;end if;end loop;
 if (b->>'campaign_exists')::boolean or (b->>'campaign_migration_exists')::boolean or (b#>>'{editorial_tables,announcements,rows}')::int<>0
 or (b->>'ledger_rows')::int>=10000 or (b->>'ledger_bytes')::bigint>=8388608
 or (b->>'active_events')::int<>0 or (b->>'overdue_outbox')::int<>0 or (b->>'lock_waits')::int<>0
 or (b->>'next_event') is null or (b->>'next_event')::timestamptz<clock_timestamp()+interval '25 minutes'
 then raise exception 'Unsafe release window or size/state gate';end if;end $gate$;\n`;
 const migration=body(await read('docs/drafts/announcement_campaigns_v1.sql'));
 const verify=`do $verify$ declare b jsonb;a jsonb;k text;n text;r text;begin
 select baseline into b from campaign_before;select baseline into a from campaign_after;
 if (a->'functions')-${array([...changed,helper])} is distinct from (b->'functions')-${array(changed)} then raise exception 'Unplanned function change';end if;
 foreach n in array ${array(changed)} loop if (a#>array['functions',n,'acl']) is distinct from (b#>array['functions',n,'acl']) or (a#>array['functions',n,'owner']) is distinct from (b#>array['functions',n,'owner']) then raise exception 'RPC permission drift';end if;end loop;
 foreach k in array array['policies','triggers','role_settings','default_acl'] loop if a->k is distinct from b->k then raise exception 'Contract drift: %',k;end if;end loop;
 if (a->'relations')-'app_announcement_completions' is distinct from b->'relations' then raise exception 'Existing relation permissions changed';end if;
 if (a->'indexes')-${array(addedIndexes)} is distinct from b->'indexes' then raise exception 'Existing index changed';end if;
 for k in select jsonb_object_keys(b->'constraints') loop if k<>'spark_ledger.spark_ledger_reason_check' and a#>array['constraints',k] is distinct from b#>array['constraints',k] then raise exception 'Existing constraint changed: %',k;end if;end loop;
 if not (select relrowsecurity from pg_class where oid='public.app_announcement_completions'::regclass) then raise exception 'Missing completion RLS';end if;
 foreach r in array array['anon','authenticated','doji_employee','service_role'] loop
 if has_function_privilege(r,'public.${helper}','execute') or has_table_privilege(r,'public.app_announcement_completions','select,insert,update,delete,truncate,references,trigger') then raise exception 'Completion exposed to %',r;end if;end loop;
 if (select count(*) from public.app_announcements)<>0 or exists(select 1 from public.app_announcement_completions) then raise exception 'Unexpected campaign data';end if;
 end $verify$;\n`;
 const member=(await read('scripts/portal-triage-member-canary.sql')).replace('begin read only;','').replace(/rollback;\s*$/,'');
 const reads=await read('scripts/portal-editorial-read-canary.sql');
 const common="begin;set local statement_timeout='8s';set local lock_timeout='2s';\n"+capture('campaign_before')+guard+migration+'\n'+capture('campaign_after')+verify+member+'\n'+reads;
 const undo=body(await read('docs/drafts/announcement_campaigns_v1.rollback.sql'));
 const undoCheck=`do $$declare n text;b jsonb;begin select baseline into b from campaign_before;foreach n in array ${array(changed)} loop if md5(pg_get_functiondef(('public.'||n)::regprocedure)) is distinct from b#>>array['functions',n,'hash'] then raise exception 'Rollback definition mismatch: %',n;end if;end loop;end$$;\n`;
 await save('common.sql',common);
 await save('rehearsal.sql',common+undo+'\n'+undoCheck+'rollback;\n');
 await save('deploy.sql',common+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','announcement_campaigns',array[$migration$${migration}$migration$]);\nnotify pgrst,'reload schema';commit;\n`);
 await save('migration.sql',migration);
 await save('rollback-body.sql',undo);
 console.log('Prepared guarded narrow migration and exact rollback rehearsal. No hosted writes executed.');
} else if(mode==='rehearsal'||mode==='deploy-db'){
 const file=mode==='rehearsal'?'rehearsal':'deploy';const source=await read(`${root}/${file}.sql`);
 const common=await read(`${root}/common.sql`);assert.ok(source.startsWith(common));
 if(mode==='deploy-db'){
  const receipt=await json(`${root}/rehearsal-result.json`);assert.equal(receipt.sha256,hash(await read(`${root}/rehearsal.sql`)));assert.equal(receipt.commonHash,hash(common));
  await save('database-deploy-started.json',{at:new Date().toISOString(),sha256:hash(source)});
 }
 const rows=query(`${root}/${file}.sql`);const record={at:new Date().toISOString(),sha256:hash(source),commonHash:hash(common),rows};await save(`${file}-result.json`,record);console.log(JSON.stringify(record));
} else if(mode==='verify-db'){
 const b=await json(`${root}/database-before.json`),a=query(`${root}/preflight.sql`)[0].baseline;
 assert.equal(a.campaign_migration_exists,true);assert.equal(a.editorial_tables.announcements.rows,0);assert.equal(a.announcements_enabled,0);
 assert.deepEqual(omit(a.functions,[...changed,helper]),omit(b.functions,changed));
 assert.equal(Object.keys(a.functions).length,Object.keys(b.functions).length+1);
 for(const n of changed){assert.deepEqual(omit(a.functions[n],['hash']),omit(b.functions[n],['hash']));assert.notEqual(a.functions[n].hash,b.functions[n].hash);}
 for(const k of ['policies','triggers','role_settings','default_acl'])assert.deepEqual(a[k],b[k],k);
 assert.deepEqual(omit(a.relations,['app_announcement_completions']),b.relations);assert.deepEqual(omit(a.indexes,addedIndexes),b.indexes);
 const checks=query('scripts/portal-triage-member-canary.sql');
 await save('database-after.json',a);await save('database-verified.json',{at:new Date().toISOString(),unchangedFunctions:Object.keys(b.functions).length-3,modifiedFunctions:changed,permissionsPreserved:true,announcements:0,checks});
 const guards=[...changed,helper].map(n=>`if md5(pg_get_functiondef('public.${n}'::regprocedure))<>'${a.functions[n].hash}' then raise exception 'Rollback drift: ${n}';end if;`).join('\n');
 await save('rollback.sql',"begin;set local statement_timeout='8s';set local lock_timeout='2s';\ndo $$begin\n"+guards+'\nend$$;\n'+await read(`${root}/rollback-body.sql`)+"\nnotify pgrst,'reload schema';commit;\n");
 console.log(JSON.stringify({verified:true,unchangedFunctions:Object.keys(b.functions).length-3,announcements:0,checks}));
} else if(mode==='prepare-site'){
 const manifest=await json(`${prior}/site-candidate.json`);const base=`${root}/site-baseline`,site=`${root}/site`;
 for(const item of manifest.assets){
  const bytes=item.path==='_headers'?await readFile(`${prior}/site/_headers`):await (async()=>{const r=await fetch('https://admin.dojipro.com/'+item.path,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);if(item.path==='index.html')for(const[k,v]of Object.entries(manifest.headers))assert.equal(r.headers.get(k),v);return Buffer.from(await r.arrayBuffer());})();
  assert.equal(hash(bytes),item.sha256,`Live asset drift: ${item.path}`);await mkdir(dirname(`${base}/${item.path}`),{recursive:true});await writeFile(`${base}/${item.path}`,bytes,{flag:'wx'});
 }
 await cp(base,site,{recursive:true});
 const oldName='admin-portal/admin-app-20260927editorial1.js',newName='admin-portal/admin-app-20260927campaign1.js';
 const baseline=await read(`${base}/${oldName}`);const runtime=baseline.indexOf('(() => {\n  const portalType = document.body.dataset.portal;');
 const editorialSource=await read('website/admin-portal/editorial.js');
 const marker=editorialSource.slice(0,editorialSource.indexOf('\n'));
 const start=baseline.indexOf(marker);assert.ok(start>0&&runtime>start);
 let bundle=baseline.slice(0,start)+editorialSource+'\n'+await read('website/portal.js')+'\n';
 const configMatch=baseline.match(/window.DOJI_PORTAL_CONFIG = Object.freeze\(([\s\S]*?)\);/);assert.ok(configMatch);const config=JSON.parse(configMatch[1]);assert.equal(config.employeeAccountsEnabled,true);assert.equal(config.editorialEnabled,true);
 bundle=bundle.replace(configMatch[0],()=>`window.DOJI_PORTAL_CONFIG = Object.freeze(${JSON.stringify({...config,campaignsEnabled:true},null,2)});`);
 await writeFile(`${site}/${newName}`,bundle,{flag:'wx'});await cp('website/admin-portal/admin.css',`${site}/admin-portal/admin.css`);
 for(const path of ['index.html','admin-portal/index.html']){const html=await read(`${base}/${path}`);assert.equal(html.split(oldName).length,2);await writeFile(`${site}/${path}`,html.replace(oldName,newName).replace('admin.css?v=20260927editorial1','admin.css?v=20260927campaign1'));}
 const changes=['index.html','admin-portal/index.html','admin-portal/admin.css',newName];
 for(const item of manifest.assets.filter(x=>!changes.includes(x.path)))assert.equal(hash(await readFile(`${site}/${item.path}`)),item.sha256,item.path);
 const assets=await Promise.all((await inventory(site)).map(async path=>({path,sha256:hash(await readFile(`${site}/${path}`))})));
 await save('site-candidate.json',{changes,headers:manifest.headers,assets,baselinePrefixHash:hash(baseline.slice(0,start)),newName});
 console.log('Prepared portal-only artifact; auth/onboarding/configuration/security headers and non-runtime assets retained.');
} else if(mode==='deploy-site'){
 assert.equal(process.argv[3],'--deploy-reviewed-artifact');assert.equal((await json(`${root}/database-verified.json`)).permissionsPreserved,true);
 const manifest=await json(`${root}/site-candidate.json`);
 assert.deepEqual((await inventory(`${root}/site`)).sort(),manifest.assets.map(x=>x.path).sort());
 for(const item of manifest.assets)assert.equal(hash(await readFile(`${root}/site/${item.path}`)),item.sha256,item.path);
 assert.ok(!manifest.assets.some(x=>x.path.includes('_worker')||x.path.startsWith('functions/')));
 const c=await cloud(),before=await json(`${root}/cloud-before.json`);assert.deepEqual(c,before,'Cloud baseline drift');
 await save('site-upload-started.json',{at:new Date().toISOString(),manifestHash:hash(JSON.stringify(manifest))});
 const out=execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',`${root}/site`,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Reviewed announcement campaign editor; no publication','--no-bundle'],{encoding:'utf8',timeout:120000,maxBuffer:1e6,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'04eab92db3126696f42644ede0943a09'}});
 await save('site-upload-output.txt',out);console.log(out);
} else {
 const manifest=await json(`${root}/site-candidate.json`);
 for(const item of manifest.assets.filter(x=>x.path!=='_headers')){const r=await fetch('https://admin.dojipro.com/'+item.path,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),item.sha256,item.path);if(item.path==='index.html')for(const[k,v]of Object.entries(manifest.headers))assert.equal(r.headers.get(k),v,k);}
 const c=await cloud(),b=await json(`${root}/cloud-before.json`);assert.deepEqual(omit(c,['pages']),omit(b,['pages']));assert.equal(c.pages.branch,'main');assert.notEqual(c.pages.id,b.pages.id);
 const a=query(`${root}/preflight.sql`)[0].baseline;assert.equal(a.announcements_enabled,0);assert.equal(a.editorial_tables.announcements.rows,0);
 const record={at:new Date().toISOString(),pages:c.pages,assets:manifest.assets.length-1,headersPreserved:true,workerUnchanged:true,announcements:0,overdueOutbox:a.overdue_outbox,lockWaits:a.lock_waits};await save('live-verified.json',record);console.log(JSON.stringify(record,null,2));
}
