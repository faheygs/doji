// Exact reviewed release on the live baseline, never the whole dirty Worker/site.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,cp,readdir} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {transform} from '../infra/doji-orchestrator/node_modules/esbuild/lib/main.js';
const root='test-results/portal-triage-release-20260927';
const read=async p=>(await readFile(p,'utf8')).replaceAll('\r\n','\n');
const hash=b=>createHash('sha256').update(b).digest('hex');
const once=(s,a,b)=>{assert.equal(s.split(a).length,2,`Patch anchor: ${a.slice(0,70)}`);return s.replace(a,b);};
const mode=process.argv[2];
assert.ok(['worker','site','sql'].includes(mode));
if(mode==='worker') {
 const baseline=await read(`${root}/live-index.js`);
 const source=await read('infra/doji-orchestrator/src/portal-read.ts');
 const start=source.indexOf("  if (url.pathname === '/portal/admin/report-case-v3'");
 const end=source.indexOf("  if (url.pathname === '/portal/admin/work-queue')",start);
 assert.ok(start>0&&end>start);
 const addition=(await transform(source.slice(start,end),{loader:'ts',target:'es2022'})).code;
 let candidate=once(baseline,'function portalRouteFor(url) {\n','function portalRouteFor(url) {\n'+addition);
 const guard='    if (route?.employeeOnly && !employeeMode) return jsonError(403, "Employee portal required", origin);\n';
 candidate=once(candidate,'    const employeeMode = env.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS === "true";\n',
   '    const employeeMode = env.ADMIN_PORTAL_EMPLOYEE_ACCOUNTS === "true";\n'+guard);
 assert.equal(candidate.replace(addition,'').replace(guard,''),baseline,'All preexisting Worker code preserved exactly');
 await writeFile(`${root}/worker-candidate.js`,candidate);
 await writeFile(`${root}/worker-patch.json`,JSON.stringify({baseline:hash(baseline),candidate:hash(candidate),addition,guard},null,2));
 console.log('Prepared two additive routes and one employee-mode guard; all other Worker bytes unchanged.');
} else if(mode==='site') {
 const base=`${root}/site-baseline`,site=`${root}/site`;
 await mkdir(base,{recursive:true});
 async function inventory(dir,prefix=''){const files=[];for(const e of await readdir(dir,{withFileTypes:true}))files.push(...e.isDirectory()?await inventory(join(dir,e.name),prefix+e.name+'/'):[prefix+e.name]);return files;}
 // Existing admin build enumerates only portal assets; no business/public-site deployment.
 const paths=(await inventory('website/.admin-dist')).filter(p=>p!=='_headers'&&!p.startsWith('admin-portal/admin-app-'));
 paths.push('admin-portal/admin-app-20260926health1.js');
 const manifest=[];let liveHeaders;
 for(const path of paths) {
   const response=await fetch(`https://admin.dojipro.com/${path}`,{cache:'no-store',signal:AbortSignal.timeout(15000)});
   assert.equal(response.status,200,path);
   if(path==='index.html') liveHeaders=Object.fromEntries(['content-security-policy','referrer-policy','permissions-policy','x-content-type-options','x-frame-options'].map(k=>[k,response.headers.get(k)]));
   const bytes=Buffer.from(await response.arrayBuffer());await mkdir(dirname(`${base}/${path}`),{recursive:true});
   await writeFile(`${base}/${path}`,bytes,{flag:'wx'});manifest.push({path,sha256:hash(bytes)});
 }
 assert.ok(liveHeaders['content-security-policy']);
 await writeFile(`${root}/site-before.json`,JSON.stringify({manifest,liveHeaders},null,2),{flag:'wx'});
 await cp(base,site,{recursive:true});
 const oldName='admin-portal/admin-app-20260926health1.js',newName='admin-portal/admin-app-20260927triage1.js';
 let bundle=await read(`${base}/${oldName}`);
 const clientStart=bundle.indexOf("(() => {\n  const storageKey = 'doji-admin-session-v1';");
 const clientEnd=bundle.indexOf('/* Portal-only progressive disclosure.',clientStart);
 const runtimeStart=bundle.indexOf('(() => {\n  const portalType = document.body.dataset.portal;');
 assert.ok(clientStart>0&&clientEnd>clientStart&&runtimeStart>clientEnd);
 bundle=bundle.slice(0,clientStart)+(await read('website/admin-portal/live-client.js'))+'\n'+bundle.slice(clientEnd,runtimeStart)+(await read('website/portal.js'))+'\n';
 await writeFile(`${site}/${newName}`,bundle);
 await cp('website/admin-portal/admin.css',`${site}/admin-portal/admin.css`);
 for(const path of ['index.html','admin-portal/index.html']) {
   const html=(await read(`${base}/${path}`)).replace(oldName,newName).replace('admin.css?v=20260926health1','admin.css?v=20260927triage1');
   assert.ok(html.includes(newName));await writeFile(`${site}/${path}`,html);
 }
 // A <video> needs media-src; default-src self previously blocked Storage media.
 // Add only the already-authorized Storage origin to this admin deployment.
 const origin=JSON.parse(bundle.match(/window.DOJI_PORTAL_CONFIG = Object.freeze\(([\s\S]*?)\);/)[1]).supabaseUrl;
 assert.equal(origin,'https://tvixsmqxotuvyjqzmjla.supabase.co');
 assert.ok(!liveHeaders['content-security-policy'].includes('media-src'));
 const candidateHeaders={...liveHeaders,'content-security-policy':liveHeaders['content-security-policy']+`; media-src 'self' ${origin}`};
 const headers='/*\n'+Object.entries(candidateHeaders).map(([k,v])=>`  ${k}: ${v}`).join('\n')+'\n\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/employee-setup/*\n  Cache-Control: no-store\n';
 await writeFile(`${site}/_headers`,headers);
 const changed=['index.html','admin-portal/index.html','admin-portal/admin.css',newName,'_headers'];
 for(const item of manifest.filter(x=>!changed.includes(x.path)))assert.equal(hash(await readFile(`${site}/${item.path}`)),item.sha256,item.path);
 await writeFile(`${root}/site-candidate.json`,JSON.stringify({changed,headers:candidateHeaders,assets:await Promise.all((await inventory(site)).map(async path=>({path,sha256:hash(await readFile(`${site}/${path}`))})))},null,2));
 console.log('Prepared isolated portal assets; onboarding/config/styles/media assets preserved. Admin-only media CSP added.');
} else {
 const b=JSON.parse(await read(`${root}/database-before.json`));
 assert.equal(b.active_events,0);assert.equal(b.overdue_outbox,0);assert.equal(b.lock_waits,0);
 assert.ok(b.decision_rows<1000&&b.decision_bytes<1048576,'Small-table lock/capacity gate');
 const names=['employee_can_read_avatar_evidence_v1(text)','get_admin_report_case_v3(uuid)','get_admin_appeal_case_v1(uuid)'];
 names.forEach(n=>assert.equal(b.functions[n],undefined));
 const raw=await read('scripts/portal-triage-preflight.sql');
 const snapshot=raw.slice(raw.indexOf('select jsonb_build_object('),raw.lastIndexOf('rollback;')).trim().replace(/;$/,'');
 const start="begin;\nset local statement_timeout='8s';\nset local lock_timeout='1s';\n";
 const capture=`create temporary table triage_before on commit drop as ${snapshot};\n`;
 const beforeGate=`do $gate$ declare b jsonb; begin select baseline into b from triage_before;
 if b->'functions' <> $baseline$${JSON.stringify(b.functions)}$baseline$::jsonb
 or b->'policies' <> $baseline$${JSON.stringify(b.policies)}$baseline$::jsonb
 or b->>'relations'<>'${b.relations}' or b->>'triggers'<>'${b.triggers}' or b->>'role_settings'<>'${b.role_settings}'
 then raise exception 'Production baseline drift'; end if;
 if (b->>'active_events')::int<>0 or (b->>'overdue_outbox')::int<>0 or (b->>'lock_waits')::int<>0
 or (b->>'next_event') is null or (b->>'next_event')::timestamptz<clock_timestamp()+interval '25 minutes'
 or (b->>'decision_rows')::int>=1000 or (b->>'decision_bytes')::bigint>=1048576
 then raise exception 'Unsafe deployment window or index sizing'; end if;
end $gate$;\n`;
 const migration=(await read('docs/drafts/20260927011000_employee_avatar_evidence.sql'))+'\n'+(await read('docs/drafts/20260927010000_portal_case_evidence_and_appeals.sql'));
 const after=`create temporary table triage_after on commit drop as ${snapshot};
do $verify$ declare b jsonb; a jsonb; n text; k text; begin
 select baseline into b from triage_before; select baseline into a from triage_after;
 if (a->'functions')-array[${names.map(n=>`'${n}'`).join(',')}] <> b->'functions' then raise exception 'Existing functions/grants changed'; end if;
 foreach n in array array[${names.map(n=>`'${n}'`).join(',')}] loop
   if has_function_privilege('authenticated','public.'||n,'execute') or has_function_privilege('anon','public.'||n,'execute')
     or has_function_privilege('service_role','public.'||n,'execute') or not has_function_privilege('doji_employee','public.'||n,'execute')
     then raise exception 'Unexpected grant: %',n; end if;
 end loop;
 foreach k in array array['relations','triggers','role_settings','avatar_bucket_public'] loop
   if a->k is distinct from b->k then raise exception 'Member contract changed: %',k; end if;
 end loop;
 if (a->'indexes')-'public.employee_avatar_decision_reference_idx' <> b->'indexes' then raise exception 'Existing index changed'; end if;
 if (select jsonb_agg(x order by x->>'schemaname',x->>'tablename',x->>'policyname') from jsonb_array_elements(a->'policies') x where not(x->>'schemaname'='storage' and x->>'tablename'='objects' and x->>'policyname' in ('employee_report_evidence_boundary','employee_avatar_evidence_read')))
 is distinct from (select jsonb_agg(x order by x->>'schemaname',x->>'tablename',x->>'policyname') from jsonb_array_elements(b->'policies') x where not(x->>'schemaname'='storage' and x->>'tablename'='objects' and x->>'policyname'='employee_report_evidence_boundary'))
 then raise exception 'Unrelated RLS changed'; end if;
 if exists(select 1 from pg_policies where policyname in ('employee_report_evidence_boundary','employee_avatar_evidence_read') and (roles<>array['doji_employee']::name[] or cmd<>'SELECT')) then raise exception 'Employee policy scope changed'; end if;
end $verify$;\n`;
 const ledger=`insert into supabase_migrations.schema_migrations(version,name,statements) values('20260927020000','employee_case_evidence',array[$migration$${migration}$migration$]);\n`;
 const canary=(await read('scripts/portal-triage-case-canary.sql'))+'\n'+(await read('scripts/portal-triage-member-canary.sql')).replace('begin read only;','').replace(/rollback;\s*$/,'');
 await writeFile(`${root}/deploy.sql`,start+capture+beforeGate+migration+'\n'+after+canary+ledger+"notify pgrst,'reload schema';\ncommit;\n");
 const undo=(await read('docs/drafts/20260927010000_portal_case_evidence_and_appeals.rollback.sql'))+'\n'+(await read('docs/drafts/20260927011000_employee_avatar_evidence.rollback.sql'));
 const exactRestored=`create temporary table triage_restored on commit drop as ${snapshot};
do $$declare b jsonb;a jsonb;k text;begin select baseline into b from triage_before;select baseline into a from triage_restored;
foreach k in array array['functions','policies','relations','triggers','role_settings','indexes','avatar_bucket_public'] loop
if a->k is distinct from b->k then raise exception 'Rollback mismatch: %',k;end if;end loop;end$$;\n`;
 await writeFile(`${root}/rehearsal.sql`,start+capture+beforeGate+migration+'\n'+after+canary+undo+'\n'+exactRestored+'rollback;\n');
 await writeFile(`${root}/rollback-body.sql`,undo);
 await writeFile(`${root}/migration.sql`,migration);
 console.log('Prepared guarded atomic SQL + rollback rehearsal; only three additive staff functions, two staff policies, one small index.');
}
