// Isolated release artifacts derived from captured production, not the dirty workspace build.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {transform} from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
const root='test-results/portal-editorial-release-20260927';
const read=async p=>(await readFile(p,'utf8')).replaceAll('\r\n','\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const save=(name,data)=>writeFile(`${root}/${name}`,typeof data==='string'?data:JSON.stringify(data,null,2),{flag:'wx'});
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,`Anchor: ${a.slice(0,70)}`);return s.replace(a,b);};
const mode=process.argv[2];
assert.ok(['worker','site','sql'].includes(mode));
if(mode==='worker') {
 const baseline=await read(`${root}/live-index.js`);
 const source=await read('infra/doji-orchestrator/src/portal-read.ts');
 const start=source.indexOf("  if (['/portal/admin/editorial-page'");
 const end=source.indexOf('  // Additive contracts: old report readers',start);
 assert.ok(start>0&&end>start);
 const addition=(await transform(source.slice(start,end),{loader:'ts',target:'es2022'})).code;
 const candidate=once(baseline,'function portalRouteFor(url) {\n','function portalRouteFor(url) {\n'+addition);
 assert.equal(candidate.replace(addition,''),baseline);
 await save('worker-candidate.js',candidate);
 await save('worker-patch.json',{baseline:hash(baseline),candidate:hash(candidate),addition,guard:''});
 console.log('Three additive editorial routes; all preexisting Worker bytes unchanged.');
} else if(mode==='site') {
 const base=`${root}/site-baseline`,site=`${root}/site`;
 await mkdir(base,{recursive:true});
 async function inventory(dir,prefix=''){const files=[];for(const e of await readdir(dir,{withFileTypes:true}))files.push(...e.isDirectory()?await inventory(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);return files;}
 // The previous verified deployment manifest lists the complete production asset set.
 const prior=JSON.parse(await read('test-results/portal-triage-release-20260927/site-candidate.json'));
 const paths=prior.assets.map(x=>x.path).filter(p=>p!=='_headers');
 const manifest=[];let liveHeaders;
 for(const path of paths) {
   const response=await fetch(`https://admin.dojipro.com/${path}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   assert.equal(response.status,200,path);
   if(path==='index.html') liveHeaders=Object.fromEntries(['content-security-policy','referrer-policy','permissions-policy','x-content-type-options','x-frame-options'].map(k=>[k,response.headers.get(k)]));
   const bytes=Buffer.from(await response.arrayBuffer());
   assert.equal(hash(bytes),prior.assets.find(x=>x.path===path).sha256,`Production asset drift: ${path}`);
   await mkdir(dirname(`${base}/${path}`),{recursive:true});
   await writeFile(`${base}/${path}`,bytes,{flag:'wx'});manifest.push({path,sha256:hash(bytes)});
 }
 assert.deepEqual(liveHeaders,prior.headers);
 await save('site-before.json',{manifest,liveHeaders});
 await cp(base,site,{recursive:true});
 const oldName='admin-portal/admin-app-20260927triage1.js',newName='admin-portal/admin-app-20260927editorial1.js';
 let bundle=await read(`${base}/${oldName}`);
 const configMatch=bundle.match(/window.DOJI_PORTAL_CONFIG = Object.freeze\(([\s\S]*?)\);/);
 assert.ok(configMatch);const config=JSON.parse(configMatch[1]);
 assert.equal(config.employeeAccountsEnabled,true);assert.equal(config.editorialEnabled,undefined);
 const clientStart=bundle.indexOf("(() => {\n  const storageKey = 'doji-admin-session-v1';");
 const clientEnd=bundle.indexOf('/* Portal-only progressive disclosure.',clientStart);
 const runtimeStart=bundle.indexOf('(() => {\n  const portalType = document.body.dataset.portal;');
 assert.ok(clientStart>0&&clientEnd>clientStart&&runtimeStart>clientEnd);
 bundle=bundle.slice(0,clientStart)+(await read('website/admin-portal/live-client.js'))+'\n'+bundle.slice(clientEnd,runtimeStart)+(await read('website/admin-portal/editorial.js'))+'\n'+(await read('website/portal.js'))+'\n';
 bundle=once(bundle,configMatch[0],`window.DOJI_PORTAL_CONFIG = Object.freeze(${JSON.stringify({...config,editorialEnabled:true},null,2)});`);
 await writeFile(`${site}/${newName}`,bundle,{flag:'wx'});
 await cp('website/admin-portal/admin.css',`${site}/admin-portal/admin.css`);
 for(const path of ['index.html','admin-portal/index.html']) {
   let html=once(await read(`${base}/${path}`),oldName,newName);
   html=once(html,'admin.css?v=20260927triage1','admin.css?v=20260927editorial1');
   await writeFile(`${site}/${path}`,html);
 }
 // Preserve every deployed header and non-runtime asset, including work-account onboarding.
 const headers=await read('test-results/portal-triage-release-20260927/site/_headers');
 await writeFile(`${site}/_headers`,headers);
 const changed=['index.html','admin-portal/index.html','admin-portal/admin.css',newName,'_headers'];
 for(const item of manifest.filter(x=>!changed.includes(x.path)))assert.equal(hash(await readFile(`${site}/${item.path}`)),item.sha256,item.path);
 const assets=await Promise.all((await inventory(site)).map(async path=>({path,sha256:hash(await readFile(`${site}/${path}`))})));
 await save('site-candidate.json',{changed,headers:liveHeaders,assets});
 console.log('Isolated admin runtime/CSS + editorial flag. Existing configuration, onboarding, headers and assets preserved.');
} else {
 const b=JSON.parse(await read(`${root}/database-before.json`));
 const names=['admin_editorial_authorize_v1(boolean)','admin_editorial_item_v1(text,uuid)','get_admin_editorial_item_v1(text,uuid)','get_admin_editorial_page_v1(text,integer,timestamp with time zone,uuid,text)','admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)'];
 names.forEach(n=>assert.equal(b.functions[n],undefined));assert.equal(b.migration_exists,false);
 for(const t of Object.values(b.editorial_tables))assert.ok(t.rows<1000&&t.bytes<1048576,'Small-table index gate');
 const tables=['admin_announcement_state','admin_suggestion_reviews'];
 const indexes=['public.editorial_announcements_page_idx','public.editorial_suggestions_page_idx','public.editorial_suggestions_status_idx','public.editorial_audit_item_idx','public.admin_announcement_state_pkey','public.admin_suggestion_reviews_pkey'];
 const array=xs=>`array[${xs.map(x=>`'${x}'`).join(',')}]`;
 const raw=await read('scripts/portal-editorial-preflight.sql');
 const snapshot=raw.slice(raw.indexOf('select jsonb_build_object('),raw.lastIndexOf('rollback;')).trim().replace(/;$/,'');
 const start="begin;\nset local statement_timeout='8s';\nset local lock_timeout='2s';\n";
 const capture=`create temporary table editorial_before on commit drop as ${snapshot};\n`;
 const beforeGate=`do $gate$ declare b jsonb; t jsonb; begin select baseline into b from editorial_before;
 if b->'functions' <> $baseline$${JSON.stringify(b.functions)}$baseline$::jsonb
 or b->'policies' <> $baseline$${JSON.stringify(b.policies)}$baseline$::jsonb
 or b->'relations' <> $baseline$${JSON.stringify(b.relations)}$baseline$::jsonb
 or b->'indexes' <> $baseline$${JSON.stringify(b.indexes)}$baseline$::jsonb
 or b->>'triggers'<>'${b.triggers}' or b->>'role_settings'<>'${b.role_settings}'
 then raise exception 'Production baseline drift'; end if;
 if (b->>'migration_exists')::boolean or (b->>'active_events')::int<>0 or (b->>'overdue_outbox')::int<>0 or (b->>'lock_waits')::int<>0
 or (b->>'next_event') is null or (b->>'next_event')::timestamptz<clock_timestamp()+interval '25 minutes'
 then raise exception 'Unsafe deployment window'; end if;
 for t in select value from jsonb_each(b->'editorial_tables') loop
 if (t->>'rows')::int>=1000 or (t->>'bytes')::bigint>=1048576 then raise exception 'Index size gate'; end if; end loop;
end $gate$;\n`;
 const migration=(await read('docs/drafts/employee_editorial_v1.sql')).replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
 const after=`create temporary table editorial_after on commit drop as ${snapshot};
do $verify$ declare b jsonb; a jsonb; n text; k text; r text; begin
 select baseline into b from editorial_before; select baseline into a from editorial_after;
 if (a->'functions')-${array(names)} <> b->'functions' then raise exception 'Existing functions/grants changed'; end if;
 foreach n in array ${array(names)} loop
 foreach r in array array['anon','authenticated','service_role'] loop
 if has_function_privilege(r,'public.'||n,'execute') then raise exception 'Unexpected grant: % %',r,n; end if; end loop;
 if has_function_privilege('doji_employee','public.'||n,'execute') <> (n like 'get_admin_%' or n like 'admin_editorial_command%') then raise exception 'Unexpected employee grant: %',n; end if;
 end loop;
 foreach k in array array['policies','triggers','role_settings','default_acl'] loop
 if a->k is distinct from b->k then raise exception 'Member contract changed: %',k; end if; end loop;
 if (a->'relations')-${array(tables)} <> b->'relations' then raise exception 'Existing relation changed'; end if;
 if (a->'indexes')-${array(indexes)} <> b->'indexes' then raise exception 'Existing index changed'; end if;
 foreach n in array ${array(tables)} loop
 if not (select relrowsecurity from pg_class where oid=('public.'||n)::regclass) then raise exception 'Missing RLS'; end if;
 foreach r in array array['anon','authenticated','doji_employee','service_role'] loop
 if has_table_privilege(r,'public.'||n,'select,insert,update,delete,truncate,references,trigger') then raise exception 'Direct table grant: % %',r,n; end if; end loop; end loop;
end $verify$;\n`;
 const member=(await read('scripts/portal-triage-member-canary.sql')).replace('begin read only;','').replace(/rollback;\s*$/,'');
 const editorial=await read('scripts/portal-editorial-read-canary.sql');
 const ledger=`insert into supabase_migrations.schema_migrations(version,name,statements) values('20260927030000','employee_editorial_workflows',array[$migration$${migration}$migration$]);\n`;
 const common=start+capture+beforeGate+migration+'\n'+after+member+'\n'+editorial;
 const undo=(await read('docs/drafts/employee_editorial_v1.rollback.sql')).replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'');
 await save('deploy.sql',common+ledger+"notify pgrst,'reload schema';\ncommit;\n");
 await save('rehearsal.sql',common+undo+`\ndo $$begin if exists(select 1 from pg_proc where oid=to_regprocedure('public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text)')) then raise exception 'Rollback failed';end if;end$$;\nrollback;\n`);
 await save('rollback-body.sql',undo);await save('migration.sql',migration);
 await save('database-contract.json',{names,tables,indexes});
 console.log('Guarded atomic DB release/rehearsal; five staff functions, two private tables, four indexes, no member contract replacements.');
}
