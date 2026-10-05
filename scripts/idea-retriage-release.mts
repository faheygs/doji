import {readBrowserSource} from '../website/browser-source.mts';
// Approved narrow release. Commands are explicit; no retries of uncertain writes.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, cp, readdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type {BinaryLike} from 'node:crypto';
import {evidenceRecord,evidenceAt,evidenceArray,evidenceRows,evidenceText,evidenceNumber,evidenceAssets} from './release-evidence.mts';
const root='test-results/idea-retriage-release-20260927';
const prior='test-results/announcement-campaign-release-20260927';
const version='20260927050000';
const changed=['admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)','admin_editorial_item_v1(text,uuid)'];
const helper='admin_idea_review_state_v1(uuid)';
const index='public.editorial_idea_open_event_idx';
const read=async(p:string)=>(await readFile(p,'utf8')).replaceAll('\r\n','\n');
const json=async(p:string)=>evidenceRecord(JSON.parse(await read(p)));
const hash=(b:BinaryLike)=>createHash('sha256').update(b).digest('hex');
const save=(p:string,v:unknown)=>writeFile(`${root}/${p}`,typeof v==='string'?v:JSON.stringify(v,null,2),{flag:'wx'});
const omit=(obj:unknown,keys:string[])=>Object.fromEntries(Object.entries(evidenceRecord(obj)).filter(([k])=>!keys.includes(k)));
const body=(s:string)=>s.replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
const arr=(xs:string[])=>`array[${xs.map(x=>`'${x}'`).join(',')}]`;
const query=(file:string)=>{const out=execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','db','query','--linked','--output-format','json','--file',file],{encoding:'utf8',timeout:30000,maxBuffer:5e6});return evidenceRows(JSON.parse(out.slice(out.indexOf('{'))));};
const apiBase='https://api.cloudflare.com/client/v4/accounts/04eab92db3126696f42644ede0943a09';
const workerPath='/workers/scripts/doji-orchestrator';
async function api(path:string,init:RequestInit={}) {
 const token=(await read('C:/Users/gfahe/AppData/Roaming/xdg.config/.wrangler/config/default.toml')).match(/^oauth_token\s*=\s*"([^"]+)"/m)?.[1];assert.ok(token);
 const r=await fetch(apiBase+path,{...init,headers:{authorization:`Bearer ${token}`},signal:AbortSignal.timeout(45000)});
 assert.ok(r.ok,`${path}: ${r.status}`);return r;
}
async function cloud() {
 const settings=(await (await api(workerPath+'/settings')).json()).result;
 for(const b of settings.bindings??[]) if(b.type==='secret_text') assert.equal(b.text,undefined);
 const form=await (await api(workerPath+'/content/v2')).formData();
 const modules=[];let source='';
 for(const [,file] of form)if(typeof file!=='string'){const bytes=Buffer.from(await file.arrayBuffer());modules.push({name:file.name,sha256:hash(bytes)});if(file.name==='index.js')source=bytes.toString('utf8');}
 assert.equal(modules.length,1);
 const schedules=(await (await api(workerPath+'/schedules')).json()).result;
 const deployments=(await (await api(workerPath+'/deployments')).json()).result;
 const pages=(await (await api('/pages/projects/doji-admin')).json()).result;
 return {settings,modules,schedules,deployments,pages:{id:pages.canonical_deployment?.id,url:pages.canonical_deployment?.url,branch:pages.production_branch},source};
}
async function inventory(dir:string,prefix=''):Promise<string[]>{const out=[];for(const e of await readdir(dir,{withFileTypes:true}))out.push(...e.isDirectory()?await inventory(`${dir}/${e.name}`,prefix+e.name+'/'):[prefix+e.name]);return out;}
const mode=process.argv[2];
assert.ok(mode&&['capture','prepare-db','rehearsal','deploy-db','verify-db','prepare-site','deploy-worker','deploy-site','verify-live'].includes(mode));
assert.equal((await read('supabase/.temp/project-ref')).trim(),'tvixsmqxotuvyjqzmjla');
await mkdir(root,{recursive:true});
if(mode==='capture') {
 let sql=await read('scripts/portal-editorial-preflight.sql');
 sql=sql.replace("'captured_at',clock_timestamp(),",`'captured_at',clock_timestamp(),
 'review_migration_exists',exists(select 1 from supabase_migrations.schema_migrations where version='${version}'),
 'event_bytes',pg_total_relation_size('public.daily_events'),
 'constraints',(select jsonb_object_agg(c.conrelid::regclass::text||'.'||c.conname,pg_get_constraintdef(c.oid)) from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname in ('public','storage')),
 'idea_state_hash',(select md5(coalesce(string_agg(to_jsonb(s)::text,'' order by id),'')) from public.challenge_suggestions s),
 'unlinked_accepted',(select count(*) from public.challenge_suggestions s left join public.admin_suggestion_reviews r on r.suggestion_id=s.id where s.status='approved' and r.challenge_id is null),`);
 await save('preflight.sql',sql);const b=evidenceRecord(query(`${root}/preflight.sql`)[0]?.baseline);
 await save('database-before.json',b);
 const p=await json(`${prior}/database-after.json`);
 for(const k of ['functions','policies','relations','triggers','role_settings','indexes','default_acl'])assert.deepEqual(b[k],p[k],`Database drift: ${k}`);
 const c=await cloud();assert.equal(c.pages.id,'2e4a7cb5-e200-4e45-84a3-11354ee7c7b1');assert.equal(c.modules[0]?.sha256,'c618cf1a99e3f0660ff84be28d986de44e4ddded89134ae0e12964651b931e1a');
 await save('worker-baseline.js',c.source);await save('cloud-before.json',omit(c,['source']));
 const anchor=': ["approved", "rejected"]';
 assert.equal(c.source.split(anchor).length,2,'Exact gateway allowlist anchor');
 const replacement=': ["approved", "rejected", "pending"]';
 const candidate=c.source.replace(anchor,replacement);
 assert.equal(hash(candidate.replace(replacement,anchor)),c.modules[0]?.sha256);
 await save('worker-candidate.js',candidate);await save('worker-patch.json',{baseline:c.modules[0]?.sha256,candidate:hash(candidate),anchor,replacement});
 console.log(JSON.stringify({at:b.captured_at,tables:b.editorial_tables,eventBytes:b.event_bytes,unlinkedAccepted:b.unlinked_accepted,next:b.next_event,active:b.active_events,overdue:b.overdue_outbox,locks:b.lock_waits,workerChange:'one portal-only action allowlist entry'}));
} else if(mode==='prepare-db') {
 const b=await json(`${root}/database-before.json`);assert.equal(b.review_migration_exists,false);assert.ok(evidenceNumber(b.event_bytes)<8*1024*1024&&evidenceNumber(evidenceAt(b,'editorial_tables','suggestions').rows)<10000);
 const raw=await read(`${root}/preflight.sql`);const snapshot=raw.slice(raw.indexOf('select jsonb_build_object('),raw.lastIndexOf('rollback;')).trim().replace(/;$/,'');
 const capture=(n:string)=>`create temp table ${n} on commit drop as ${snapshot};\n`;
 const keys=['functions','policies','relations','triggers','role_settings','indexes','default_acl','constraints'];
 const expected=JSON.stringify(Object.fromEntries(keys.map(k=>[k,b[k]])));
 const guard=`do $g$ declare b jsonb;k text;x jsonb:=$base$${expected}$base$::jsonb;begin
 select baseline into b from review_before;
 foreach k in array ${arr(keys)} loop if b->k is distinct from x->k then raise exception 'Baseline drift: %',k;end if;end loop;
 if (b->>'review_migration_exists')::boolean or (b->>'event_bytes')::bigint>=8388608
 or (b->>'active_events')::int<>0 or (b->>'overdue_outbox')::int<>0 or (b->>'lock_waits')::int<>0
 or b->>'next_event' is null or (b->>'next_event')::timestamptz<clock_timestamp()+interval '25 minutes' then raise exception 'Unsafe release window';end if;end $g$;\n`;
 const migration=body(await read('docs/drafts/community_idea_retriage_v1.sql'));
 const verification=`do $v$ declare b jsonb;a jsonb;k text;n text;r text;begin
 select baseline into b from review_before;select baseline into a from review_after;
 if (a->'functions')-${arr([...changed,helper])} is distinct from (b->'functions')-${arr(changed)} then raise exception 'Unrelated function drift';end if;
 foreach n in array ${arr(changed)} loop if (a#>array['functions',n,'acl']) is distinct from (b#>array['functions',n,'acl']) or (a#>array['functions',n,'owner']) is distinct from (b#>array['functions',n,'owner']) then raise exception 'Grant drift';end if;end loop;
 foreach k in array array['policies','relations','triggers','role_settings','default_acl','idea_state_hash'] loop if a->k is distinct from b->k then raise exception 'Unrelated drift: %',k;end if;end loop;
 if (a->'indexes')-'${index}' is distinct from b->'indexes' then raise exception 'Index drift';end if;
 if (a->'constraints')-'admin_suggestion_reviews.admin_suggestion_reviews_decision_check' is distinct from (b->'constraints')-'admin_suggestion_reviews.admin_suggestion_reviews_decision_check' then raise exception 'Constraint drift';end if;
 foreach r in array array['anon','authenticated','doji_employee','service_role'] loop if has_function_privilege(r,'public.${helper}','execute') then raise exception 'Helper exposed';end if;end loop;
 end $v$;\n`;
 const common='begin;set local lock_timeout=\'2s\';set local statement_timeout=\'8s\';\n'+capture('review_before')+guard+migration+'\n'+capture('review_after')+verification;
 await save('common.sql',common);await save('migration.sql',migration);
 const rollback=body(await read('docs/drafts/community_idea_retriage_v1.rollback.sql'));await save('rollback-body.sql',rollback);
 await save('rehearsal.sql',common+rollback+"\ndo $$begin if position('temporarily paused' in pg_get_functiondef('public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)'::regprocedure))=0 then raise exception 'Rollback gate missing';end if;end$$;select true as rehearsal_passed;rollback;\n");
 await save('deploy.sql',common+`insert into supabase_migrations.schema_migrations(version,name,statements) values('${version}','community_idea_retriage',array[$migration$${migration}$migration$]);notify pgrst,'reload schema';select clock_timestamp() as deployed_at;commit;\n`);
 console.log('Prepared guarded migration, rollback and rehearsal. No deployment.');
} else if(mode==='rehearsal'||mode==='deploy-db') {
 const name=mode==='rehearsal'?'rehearsal':'deploy';const source=await read(`${root}/${name}.sql`);const common=await read(`${root}/common.sql`);assert.ok(source.startsWith(common));
 if(mode==='deploy-db'){const r=await json(`${root}/rehearsal-result.json`);assert.equal(r.commonHash,hash(common));await save('database-deploy-started.json',{at:new Date().toISOString(),hash:hash(source)});}
 const rows=query(`${root}/${name}.sql`);await save(`${name}-result.json`,{at:new Date().toISOString(),sha256:hash(source),commonHash:hash(common),rows});console.log(JSON.stringify(rows));
} else if(mode==='verify-db') {
 const b=await json(`${root}/database-before.json`),a=evidenceRecord(query(`${root}/preflight.sql`)[0]?.baseline);
 assert.equal(a.review_migration_exists,true);assert.deepEqual(omit(a.functions,[...changed,helper]),omit(b.functions,changed));
 for(const n of changed)assert.deepEqual(omit(evidenceAt(a,'functions',n),['hash']),omit(evidenceAt(b,'functions',n),['hash']));
 for(const k of ['policies','relations','triggers','role_settings','default_acl'])assert.deepEqual(a[k],b[k]);
 assert.deepEqual(omit(a.indexes,[index]),b.indexes);
 const checks=query('scripts/portal-triage-member-canary.sql');
 await save('database-after.json',a);await save('database-verified.json',{at:new Date().toISOString(),permissionsPreserved:true,unchangedFunctions:Object.keys(evidenceRecord(b.functions)).length-2,checks});
 const guard=[...changed,helper].map(n=>`if md5(pg_get_functiondef('public.${n}'::regprocedure))<>'${evidenceAt(a,'functions',n).hash}' then raise exception 'Rollback drift';end if;`).join('\n');
 await save('rollback.sql',"begin;set local lock_timeout='2s';set local statement_timeout='8s';do $$begin\n"+guard+'\nend$$;\n'+await read(`${root}/rollback-body.sql`)+"\nnotify pgrst,'reload schema';commit;\n");
 console.log(JSON.stringify({verified:true,checks}));
} else if(mode==='prepare-site') {
 await assert.rejects(access(`${root}/site-upload-started.json`),{code:'ENOENT'},'Cannot rebuild a submitted artifact');
 const manifest=await json(`${prior}/site-candidate.json`);const baseline=`${root}/site-baseline`,site=`${root}/site`;
 for(const a of evidenceAssets(manifest.assets)){const bytes=a.path==='_headers'?await readFile(`${prior}/site/_headers`):await(async()=>{const r=await fetch('https://admin.dojipro.com/'+a.path,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);return Buffer.from(await r.arrayBuffer());})();assert.equal(hash(bytes),a.sha256,a.path);await mkdir(dirname(`${baseline}/${a.path}`),{recursive:true});await writeFile(`${baseline}/${a.path}`,bytes);}
 await cp(baseline,site,{recursive:true});
 const oldName='admin-portal/admin-app-20260927campaign1.js',newName='admin-portal/admin-app-20260927ideas1.js';
 const old=await read(`${baseline}/${oldName}`);const source=readBrowserSource('admin-portal/editorial.js');
 const start=old.indexOf(source.slice(0,source.indexOf('\n')));const end=old.indexOf('(() => {\n  const portalType = document.body.dataset.portal;');assert.ok(start>0&&end>start);
 await writeFile(`${site}/${newName}`,old.slice(0,start)+source+'\n'+old.slice(end));
 const oldCss=await read(`${baseline}/admin-portal/admin.css`);const css=await read('website/admin-portal/admin.css');assert.ok(css.startsWith(oldCss.trimEnd()));await writeFile(`${site}/admin-portal/admin.css`,css);
 for(const p of ['index.html','admin-portal/index.html']){const html=await read(`${baseline}/${p}`);assert.equal(html.split(oldName).length,2);await writeFile(`${site}/${p}`,html.replace(oldName,newName).replace('admin.css?v=20260927campaign1','admin.css?v=20260927ideas1'));}
 const changes=['index.html','admin-portal/index.html','admin-portal/admin.css',newName];
 for(const a of evidenceAssets(manifest.assets).filter(a=>!changes.includes(a.path)))assert.equal(hash(await readFile(`${site}/${a.path}`)),a.sha256,a.path);
 const assets=await Promise.all((await inventory(site)).map(async path=>({path,sha256:hash(await readFile(`${site}/${path}`))})));
 await writeFile(`${root}/site-candidate.json`,JSON.stringify({assets,changes,headers:manifest.headers},null,2));console.log('Prepared exact live baseline plus editorial-only changes.');
} else if(mode==='deploy-worker') {
 assert.equal(process.argv[3],'--deploy-reviewed-artifact');assert.equal((await json(`${root}/database-verified.json`)).permissionsPreserved,true);
 const b=await json(`${root}/cloud-before.json`);const c=await cloud();assert.deepEqual(omit(c,['source']),b);
 const p=await json(`${root}/worker-patch.json`);const source=await read(`${root}/worker-candidate.js`);assert.equal(hash(source),p.candidate);assert.equal(hash(source.replace(evidenceText(p.replacement),evidenceText(p.anchor))),p.baseline);
 const w=evidenceRecord(query('scripts/portal-editorial-release-window.sql')[0]?.release_window);assert.equal(w.active,0);assert.equal(w.overdue,0);assert.equal(w.locks,0);assert.ok(w.next&&Date.parse(evidenceText(w.next))>Date.parse(evidenceText(w.at))+25*60000);
 const s=c.settings;const metadata={main_module:'index.js',compatibility_date:s.compatibility_date,compatibility_flags:s.compatibility_flags,bindings:evidenceArray(s.bindings).filter(b=>b.type!=='secret_text'),keep_bindings:['secret_text'],usage_model:s.usage_model,logpush:s.logpush,observability:s.observability,tags:s.tags,tail_consumers:s.tail_consumers,placement:s.placement};
 const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set('index.js',new Blob([source],{type:'application/javascript+module'}),'index.js');
 await save('worker-upload-started.json',{at:new Date().toISOString(),sha256:p.candidate});
 const result=await(await api(workerPath,{method:'PUT',body:form})).json();assert.equal(result.success,true);
 const a=await cloud();assert.equal(a.modules[0]?.sha256,p.candidate);assert.deepEqual(a.settings,b.settings);assert.deepEqual(a.schedules,b.schedules);assert.deepEqual(a.pages,b.pages);
 await save('worker-released.json',omit(a,['source']));console.log(JSON.stringify({worker:a.deployments,settingsAndSchedulesPreserved:true}));
} else if(mode==='deploy-site') {
 assert.equal(process.argv[3],'--deploy-reviewed-artifact');const manifest=await json(`${root}/site-candidate.json`);const w=await json(`${root}/worker-released.json`);const c=await cloud();assert.deepEqual(omit(c,['source']),w);
 for(const a of evidenceAssets(manifest.assets))assert.equal(hash(await readFile(`${root}/site/${a.path}`)),a.sha256,a.path);
 assert.ok(!evidenceAssets(manifest.assets).some(a=>a.path.includes('_worker')||a.path.startsWith('functions/')));
 await save('site-upload-started.json',{at:new Date().toISOString()});
 const out=execFileSync(process.execPath,['infra/doji-orchestrator/node_modules/wrangler/bin/wrangler.js','pages','deploy',`${root}/site`,'--project-name','doji-admin','--branch','main','--commit-dirty=true','--commit-message','Reviewed reversible community idea triage','--no-bundle'],{encoding:'utf8',timeout:120000,maxBuffer:1e6,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:'04eab92db3126696f42644ede0943a09'}});await save('site-upload-output.txt',out);console.log(out);
} else {
 const m=await json(`${root}/site-candidate.json`);for(const a of evidenceAssets(m.assets).filter(x=>x.path!=='_headers')){const r=await fetch('https://admin.dojipro.com/'+a.path,{cache:'no-store',signal:AbortSignal.timeout(15000)});assert.equal(r.status,200);assert.equal(hash(Buffer.from(await r.arrayBuffer())),a.sha256,a.path);if(a.path==='index.html')for(const[k,v]of Object.entries(evidenceRecord(m.headers)))assert.equal(r.headers.get(k),v);}
 const c=await cloud(),w=await json(`${root}/worker-released.json`);assert.deepEqual(omit(c,['source','pages']),omit(w,['pages']));assert.notEqual(c.pages.id,evidenceAt(w,'pages').id);
 const a=evidenceRecord(query(`${root}/preflight.sql`)[0]?.baseline);const canary=query('scripts/portal-triage-member-canary.sql');
 const result={at:new Date().toISOString(),pages:c.pages,assets:evidenceAssets(m.assets).length-1,worker:c.deployments,announcements:evidenceAt(a,'editorial_tables','announcements').rows,overdue:a.overdue_outbox,locks:a.lock_waits,canary};await save('live-verified.json',result);console.log(JSON.stringify(result));
}
