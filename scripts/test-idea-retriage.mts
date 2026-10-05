// Offline synthetic clone only. Never connects to a hosted database.
import { execFileSync, execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import type {ExecFileException} from 'node:child_process';
import {offlineContainer,errorOutput} from './database/contracts.mts';
import {evidenceRecord,evidenceText} from './release-evidence.mts';
const podman='C:/Program Files/RedHat/Podman/podman.exe';
const container='supabase_db_employee-cutover-verify';
const info=offlineContainer(JSON.parse(execFileSync(podman,['inspect',container],{encoding:'utf8'})));
assert.equal(info.HostConfig.NetworkMode,'none');
assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
const db=`idea_retriage_qa_${Date.now()}`;
assert.match(db,/^idea_retriage_qa_[0-9]+$/);
const args=(d:string)=>['exec','-i',container,'psql','-X','-U','postgres','-d',d,'-At','-v','ON_ERROR_STOP=1'];
const sync=(sql:string,d=db)=>execFileSync(podman,args(d),{input:sql,encoding:'utf8',maxBuffer:8e6,stdio:['pipe','pipe','pipe']});
const asyncQuery=(sql:string)=>new Promise<{error:ExecFileException|null;stdout:string;stderr:string}>(resolve=>{
 const child=execFile(podman,args(db),{encoding:'utf8',maxBuffer:8e6},(error,stdout,stderr)=>resolve({error,stdout,stderr}));assert.ok(child.stdin);child.stdin.end(sql);
});
const read=(p:string)=>readFileSync(p,'utf8');
let created=false;
try {
 assert.equal(sync("select count(*) from auth.users where email is null or email not like '%@test.invalid'; select count(*) from vault.secrets;",'postgres').trim(),'0\n0');
 sync(`create database ${db} template postgres;`,'postgres');created=true;
 sync(read('docs/drafts/employee_editorial_v1.sql'));
 sync(`begin;${read('scripts/test-editorial-local.sql')}reset role;commit;`);
 sync(read('docs/drafts/announcement_campaigns_v1.sql'));
 // Exact retained approval receipt versus text-only historical coincidence.
 sync(`insert into public.command_receipts(user_id,idempotency_key,result)
 select (select id from public.profiles where username='editorial_test'),'legacy-approval-receipt',
 to_jsonb(s)||jsonb_build_object('reviewed_by',(select id from public.profiles where username='editorial_test'),'challenge_id',r.challenge_id)
 from public.challenge_suggestions s join public.admin_suggestion_reviews r on r.suggestion_id=s.id
 where s.id='61111111-2222-4333-8444-555555555555';
 update public.challenge_suggestions set reviewed_by=(select id from public.profiles where username='editorial_test') where id='61111111-2222-4333-8444-555555555555';
 delete from public.admin_suggestion_reviews where suggestion_id='61111111-2222-4333-8444-555555555555';`);
 const employee=sync("select id from public.admin_employees where 'super_admin'=any(roles) limit 1;").trim();
 const claims=JSON.stringify({sub:employee,role:'doji_employee',aal:'aal2'});
 const snapshot=sync("select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(pg_get_functiondef(p.oid),p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';").trim();
 const policies=sync('select jsonb_agg(p order by schemaname,tablename,policyname) from pg_policies p;').trim();
 sync(read('docs/drafts/community_idea_retriage_v1.sql'));
 assert.equal(sync("select count(*) from public.admin_suggestion_reviews where suggestion_id='61111111-2222-4333-8444-555555555555' and challenge_id is not null;").trim(),'1');
 const after=evidenceRecord(JSON.parse(sync("select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(pg_get_functiondef(p.oid),p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';").trim()));
 const before=evidenceRecord(JSON.parse(snapshot));
 for(const [name,value] of Object.entries(before)) {
   const actual=after[name];assert.ok(Array.isArray(actual)&&Array.isArray(value));assert.equal(actual.length,2);assert.equal(value.length,2);
   assert.deepEqual(actual[1],value[1],`grant changed: ${name}`);
   if(!name.startsWith('admin_editorial_command_v1(')&&!name.startsWith('admin_editorial_item_v1(')) assert.equal(actual[0],value[0],`unrelated function changed: ${name}`);
 }
 assert.equal(sync('select jsonb_agg(p order by schemaname,tablename,policyname) from pg_policies p;').trim(),policies);
 sync(`begin;
 ${read('scripts/test-editorial-local.sql').split("select set_config('test.member'")[0]}
 select set_config('test.claims','${claims}',true);
 ${read('scripts/test-idea-retriage.sql')}
 commit;`);
 console.log('PASS: state transitions, history, rewards, poll options, safe reads, event protection and unchanged member functions/grants/RLS');
 const id='11111111-2222-4333-8444-555555555555';
 const version=sync(`select md5(to_jsonb(s)::text) from public.challenge_suggestions s where id='${id}';`).trim();
 const prefix=`begin;set local lock_timeout='3s';set local statement_timeout='6s';select set_config('request.jwt.claims','${claims}',true);set local role doji_employee;`;
 const cmd=(action:string,key:string)=>`select public.admin_editorial_command_v1('suggestions','${action}','${id}','${version}','{}','Concurrent review fixture','${key}');`;
 const retries=await Promise.all([asyncQuery(prefix+cmd('approved','retriage-concurrent-retry')+'select pg_sleep(0.3);commit;'),asyncQuery(prefix+cmd('approved','retriage-concurrent-retry')+'commit;')]);
 retries.forEach(r=>assert.equal(r.error,null,r.stderr));
 assert.equal(sync("select count(*) from public.admin_audit_log where request_id='retriage-concurrent-retry';").trim(),'1');
 const nextVersion=sync(`select md5(to_jsonb(s)::text) from public.challenge_suggestions s where id='${id}';`).trim();
 const conflict=await Promise.all(['pending','rejected'].map(a=>asyncQuery(prefix+cmd(a,'retriage-conflict-'+a).replace(version,nextVersion)+'commit;')));
 assert.equal(conflict.filter(r=>r.error===null).length,1);
 assert.ok(conflict.find(r=>r.error)?.stderr.includes('Idea changed'));
 console.log('PASS: simultaneous retries commit once; conflicting decisions reject the stale writer');
 // Hold the real scheduler lock; administrative review must fail fast.
 const hold=asyncQuery("begin;select pg_advisory_xact_lock(hashtextextended('doji:prepare-next',0));select pg_sleep(2);commit;");
 for(let i=0;i<30;i++) {if(sync("select count(*) from pg_locks where locktype='advisory' and granted and pid<>pg_backend_pid();").trim()!=='0')break;await new Promise<void>(r=>{setTimeout(r,20);});}
 const row=evidenceRecord(JSON.parse(sync(`select public.admin_editorial_item_v1('suggestions','${id}');`).trim()));
 const busy=await asyncQuery(prefix+cmd('approved','retriage-schedule-race').replace(version,evidenceText(row.version))+'commit;');
 assert.ok(busy.stderr.includes('scheduling is in progress'),busy.stderr);
 assert.equal((await hold).error,null);
 console.log('PASS: scheduler is protected from competing editorial work');
 sync(read('docs/drafts/community_idea_retriage_v1.rollback.sql'));
 const paused=await asyncQuery(prefix+cmd('approved','retriage-rollback-test')+'commit;');
 assert.ok(paused.stderr.includes('temporarily paused'));
 assert.ok(Number(sync('select count(*) from public.admin_suggestion_reviews;').trim())>0);
 console.log('PASS: rollback pauses idea decisions and retains history, challenge links and earned rewards');
} catch(error){ console.error(errorOutput(error,'stderr'));process.exitCode=1; }
finally {if(created)sync(`drop database ${db};`,'postgres');}
