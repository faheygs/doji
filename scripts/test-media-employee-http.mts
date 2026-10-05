// Synthetic, unlinked localhost only. Real Storage authorization/signing, no cloud.
import {execFileSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {createHmac,createHash,randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
import {offlineContainer,errorOutput} from './database/contracts.mts';
import {evidenceRecord,evidenceArray,evidenceText,evidenceStrings} from './release-evidence.mts';
const podman='C:/Program Files/RedHat/Podman/podman.exe',source='supabase_db_employee-cutover-verify',destination='supabase_db_media-storage-verify';
const workdir='D:/ChallengeApp/DoIt/test-results/media-storage-verify';
assert.ok(!existsSync(`${workdir}/supabase/.temp/project-ref`));
const info=offlineContainer(JSON.parse(execFileSync(podman,['inspect',source],{encoding:'utf8'})));assert.equal(info.HostConfig.NetworkMode,'none');
const run=(container:string,input:string)=>{try{return execFileSync(podman,['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:15000000}).trim();}catch(error){throw Error(errorOutput(error,'stderr').slice(-1800)||'Local SQL failed');}};
const localOnly=`do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic-only database required'; end if; end$$;`;
run(source,localOnly);run(destination,localOnly);
if(run(destination,"select to_regclass('public.profiles') is null;")==='t'){
 assert.equal(run(destination,"select count(*) from pg_class where relnamespace='public'::regnamespace and relkind in('r','p');"),'0');
 // Keep actual object ACLs/RLS. Default grants for future objects owned by other
 // managed roles cannot be restored by postgres and are not used by this fixture.
 const schema=execFileSync(podman,['exec',source,'pg_dump','-U','postgres','-d','postgres','--schema-only','--schema=public','--no-owner'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],maxBuffer:15000000}).replace(/^CREATE SCHEMA public;$/m,'').replace(/^ALTER DEFAULT PRIVILEGES .*;$/gm,'');
 const policies=evidenceArray(evidenceRecord(JSON.parse(readFileSync('test-results/safety-launch-preflight-jrIpAs/database.json','utf8'))).storage_policies);
 const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
 const policySql=policies.filter(p=>p.policyname!=='employee_avatar_evidence_read').map(p=>`create policy ${quote(evidenceText(p.policyname))} on storage.objects as ${evidenceText(p.permissive)} for ${evidenceText(p.cmd)} to ${evidenceStrings(p.roles).map(quote).join(',')}${p.qual?` using (${evidenceText(p.qual)})`:''}${p.with_check?` with check (${evidenceText(p.with_check)})`:''};`).join('\n');
 // Snapshot predates the released avatar-evidence migration; apply it below.
 const boundary=policySql.replace(" OR ((bucket_id = 'avatars'::text) AND employee_can_read_avatar_evidence_v1(name))",'');
 const drafts=['moderation_media_ledger_v1.sql','moderation_media_restoration_v1.sql','moderation_media_cleanup_v1.sql','moderation_media_evidence_v1.sql'].map(n=>readFileSync(`docs/drafts/${n}`,'utf8').replace(/^begin;\s*$/m,'').replace(/^commit;\s*$/m,'')).join('\n');
 const evidence=readFileSync('supabase/migrations/20260927020000_employee_case_evidence.sql','utf8');
 run(destination,`begin;create extension if not exists pg_trgm with schema extensions;create extension if not exists pg_net with schema extensions;create extension if not exists pg_cron;
 do $$begin if not exists(select 1 from pg_roles where rolname='doji_employee') then create role doji_employee nologin;end if;end$$;
 grant doji_employee to authenticator;${schema}\nset local search_path=public;set local check_function_bodies=true;${boundary}\ngrant usage on schema storage to doji_employee;grant select on storage.objects to doji_employee;
 ${evidence}\n${drafts}\ninsert into public.admin_employee_cutover values(true,true);commit;`);
}
const status=JSON.parse(execFileSync(process.execPath,['node_modules/supabase/dist/supabase.js','status','--workdir',workdir,'--output','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,PATH:`C:/Program Files/RedHat/Podman;${process.env.PATH}`}}));
assert.equal(status.API_URL,'http://127.0.0.1:54431');assert.ok(status.JWT_SECRET);
const bridge=readFileSync('scripts/test-safety-removal-bridge.sql','utf8');
const fixture=bridge.slice(bridge.indexOf('do $$declare author'),bridge.indexOf('end$$;')+7);
const checks=readFileSync('scripts/test-moderation-media-restoration.sql','utf8');
const setup=checks.slice(0,checks.indexOf("select set_config('test.media_case'"));
const employee=randomUUID();
const output=run(destination,`begin;insert into auth.users(id,email,role,aud,email_confirmed_at,raw_app_meta_data) values('${employee}','${employee}@test.invalid','doji_employee','authenticated',now(),'{"account_type":"employee"}');
 insert into public.admin_employees(id,display_name,status,roles) values('${employee}','Synthetic Storage reviewer','active',array['super_admin']);
 ${fixture}\n${setup}\nselect 'FIXTURE:'||jsonb_build_object('employee','${employee}','member',current_setting('test.author'),'object',current_setting('test.object'),'report',current_setting('test.report')::jsonb->>'id')::text;commit;`);
const f=evidenceRecord(JSON.parse(evidenceText(output.split('\n').find(x=>x.startsWith('FIXTURE:'))).slice(8)));
const objectPath=`${f.object}/original`,bytes=Buffer.from('fixture');
const headers={apikey:status.ANON_KEY,authorization:`Bearer ${status.SERVICE_ROLE_KEY}`,'content-type':'image/jpeg'};
const upload=await fetch(`${status.API_URL}/storage/v1/object/moderation-evidence/${objectPath}`,{method:'POST',headers,body:bytes});assert.ok(upload.ok,'synthetic archive upload');
run(destination,`update public.moderation_media_objects m set archive_proof=jsonb_build_object('sha256','${createHash('sha256').update(bytes).digest('hex')}','size',7,'evidenceIdentity',jsonb_build_object('id',o.id,'version',o.version,'size',(o.metadata->>'size')::bigint,'mime',o.metadata->>'mimetype')) from storage.objects o where m.id='${f.object}' and o.bucket_id='moderation-evidence' and o.name='${objectPath}';`);
const jwt=(role:string,sub:string,aal='aal2')=>{
 const parts=[{alg:'HS256',typ:'JWT'},{role,sub,aal,aud:'authenticated',iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+600}].map(v=>Buffer.from(JSON.stringify(v)).toString('base64url')).join('.');
 return `${parts}.${createHmac('sha256',status.JWT_SECRET).update(parts).digest('base64url')}`;
};
async function sign(role:string,sub:string,aal='aal2'){
 return fetch(`${status.API_URL}/storage/v1/object/sign/moderation-evidence/${objectPath}`,{method:'POST',headers:{apikey:status.ANON_KEY,authorization:`Bearer ${jwt(role,sub,aal)}`,'content-type':'application/json'},body:JSON.stringify({expiresIn:60})});
}
let response=await sign('doji_employee',employee);assert.equal(response.status,200,'MFA employee signs verified evidence');
const signed=await response.json();assert.ok((await fetch(`${status.API_URL}/storage/v1${signed.signedURL}`)).ok,'signed employee preview actually serves bytes');
assert.ok(!(await sign('doji_employee',employee,'aal1')).ok,'AAL1 denied');
assert.ok(!(await sign('authenticated',evidenceText(f.member))).ok,'member denied');
assert.ok(!(await sign('anon',evidenceText(f.member))).ok,'anonymous denied');
run(destination,`update public.admin_employees set roles=array['moderator'] where id='${employee}';insert into public.admin_report_triage(report_id,queue) values('${f.report}','restricted_safety') on conflict(report_id) do update set queue='restricted_safety';`);
assert.ok(!(await sign('doji_employee',employee)).ok,'restricted case denied to routine moderator');
run(destination,`update public.admin_employees set roles=array['operations'] where id='${employee}';`);
assert.equal((await sign('doji_employee',employee)).status,200,'restricted authorized employee signs');
run(destination,`update public.admin_employees set status='disabled' where id='${employee}';`);
assert.ok(!(await sign('doji_employee',employee)).ok,'disabled employee denied');
console.log('Actual localhost Storage signing/preview passed for authorized MFA employee; AAL1, member, anonymous, routine restricted reviewer and disabled employee denied. Synthetic fixtures retained locally; no cloud requests.');
