// Disposable synthetic clone in the offline PostgreSQL container; no hosted calls.
import { execFile, execFileSync } from 'node:child_process';
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
const db=`campaign_qa_${Date.now()}`;
assert.match(db,/^campaign_qa_[0-9]+$/);
const args=(database:string)=>['exec','-i',container,'psql','-X','-qAt','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1'];
const sync=(sql:string,database=db)=>execFileSync(podman,args(database),{input:sql,encoding:'utf8',maxBuffer:8*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
const run=(sql:string)=>new Promise<{error:ExecFileException|null;stdout:string;stderr:string}>(resolve=>{
 const child=execFile(podman,args(db),{encoding:'utf8',maxBuffer:8*1024*1024},(error,stdout,stderr)=>resolve({error,stdout,stderr}));
 assert.ok(child.stdin);child.stdin.end(sql);
});
const literal=(value:unknown)=>`'${String(value).replaceAll("'","''")}'`;
const jsonResult=(output:string)=>evidenceRecord(JSON.parse(evidenceText(output.split('\n').reverse().find(line=>line.startsWith('{')))));
let created=false;
try {
 assert.equal(sync("select count(*) from auth.users where email is null or email not like '%@test.invalid';select count(*) from vault.secrets;",'postgres'),'0\n0');
 sync(`create database ${db} template postgres;`,'postgres'); created=true;
 sync(readFileSync('docs/drafts/employee_editorial_v1.sql','utf8'));
 sync(`begin;${readFileSync('scripts/test-editorial-local.sql','utf8')}reset role;commit;`);
 sync(readFileSync('docs/drafts/announcement_campaigns_v1.sql','utf8'));
 sync('update public.app_announcements set enabled=false;');
 const member=sync("select id from public.profiles where username='editorial_test';");
 const employee=sync("select id from public.admin_employees where 'super_admin'=any(roles) limit 1;");
 const second=sync(`insert into auth.users(id,aud,role,email,raw_user_meta_data) select gen_random_uuid(),aud,role,'campaign-other@test.invalid',raw_user_meta_data from auth.users where id=${literal(member)} returning id;`);
 sync(`insert into public.profiles(id,username,display_name) values(${literal(second)},'campaign_other','Synthetic other');`);
 const prefix=(id:string,role='authenticated')=>`begin;set local lock_timeout='5s';set local statement_timeout='8s';set local request.jwt.claims=${literal(JSON.stringify({sub:id,role,aal:role==='doji_employee'?'aal2':'aal1'}))};set local role ${role};`;
 const staff=prefix(employee,'doji_employee');
 const submit=(body:string,key:string)=>`select public.submit_challenge_suggestion('question',${literal(body)},'ignored','[]',${literal(key)});`;
 const input=(start="clock_timestamp()-interval '1 hour'",end="clock_timestamp()+interval '1 hour'")=>`jsonb_build_object('title','Concurrent fixture','body','Offline campaign only','starts_at',${start},'ends_at',${end},'priority',0,'max_impressions_per_user',3,'min_hours_between_impressions',1,'cta_label','Submit an idea','cta_url','/(app)/suggest-challenge','reward_action','submit_idea','reward_sparks',500)`;
 const create=(key:string,expression=input())=>jsonResult(sync(`${staff}select public.admin_editorial_command_v1('announcements','create',null,null,${expression},'Synthetic concurrency',${literal(key)});commit;`));
 const command=(row:Record<string,unknown>,action:string,key:string)=>`select public.admin_editorial_command_v1('announcements',${literal(action)},${literal(row.id)},${literal(row.version)},'{}','Synthetic concurrency',${literal(key)});`;
 let campaign=create('concurrent-campaign-create');
 campaign=jsonResult(sync(`${staff}${command(campaign,'publish','concurrent-campaign-publish')}commit;`));
 const results=await Promise.all([
  run(`${prefix(member)}${submit('A simultaneous first valid idea today','concurrent-first-idea')}select pg_sleep(0.3);commit;`),
  run(`${prefix(member)}${submit('A simultaneous second valid idea today','concurrent-second-idea')}commit;`),
 ]);
 for(const r of results) assert.equal(r.error,null,r.stderr);
 assert.equal(sync("select count(*)||':'||sum(delta) from public.spark_ledger where reason='announcement_completion';"),'1:500');
 assert.equal(sync('select count(*) from public.app_announcement_completions;'),'1');
 console.log('PASS different-key concurrent submissions: two ideas, one reward');
 const plan = sync("begin;set local enable_seqscan=off;explain (format json) select id from public.app_announcements where enabled and tstzrange(starts_at,ends_at,'[)') @> statement_timestamp() and reward_action='submit_idea';rollback;");
 assert.ok(plan.includes('announcement_one_enabled_window') && plan.includes('Index Cond'), plan);
 console.log('PASS committed campaign lookup has a partial GiST range index path (not a production-load benchmark)');
 const same=await Promise.all([run(`${prefix(member)}${submit('Identical retried suggestion from two requests','concurrent-identical-idea')}commit;`),run(`${prefix(member)}${submit('Identical retried suggestion from two requests','concurrent-identical-idea')}commit;`)]);
 for(const r of same) assert.equal(r.error,null,r.stderr);
 assert.equal(sync("select count(*) from public.challenge_suggestions where body='Identical retried suggestion from two requests';"),'1');
 console.log('PASS identical command retries: one idea, no duplicate bonus');
 sync(`${prefix(second)}${submit('This idea and reward must both roll back','rollback-qualified-idea')}rollback;`);
 assert.equal(sync(`select count(*) from public.app_announcement_completions where user_id=${literal(second)};`),'0');
 assert.equal(sync("select count(*) from public.challenge_suggestions where body='This idea and reward must both roll back';"),'0');
 assert.equal(sync(`select count(*) from public.spark_ledger where user_id=${literal(second)} and reason='announcement_completion';`),'0');
 console.log('PASS transaction rollback removes idea, completion and bonus together');
 sync(`${prefix(second)}${submit('Another member qualifies independently today','second-member-qualifies')}commit;`);
 assert.equal(sync("select count(*)||':'||sum(delta) from public.spark_ledger where reason='announcement_completion';"),'2:1000');
 assert.equal(sync(`${prefix(second)}select count(*) from public.claim_active_app_announcement();commit;`),'0');
 console.log('PASS separate members each earn once; completed campaign no longer prompts');

 // Exact adjacent windows are permitted, overlapping windows are not.
 const boundary=sync(`select ends_at from public.app_announcements where id=${literal(campaign.id)};`);
 const adjacent=create('adjacent-future-draft',input(`${literal(boundary)}::timestamptz`,`clock_timestamp()+interval '2 hours'`));
 sync(`${staff}${command(adjacent,'publish','adjacent-future-publish')}commit;`);
 assert.equal(sync(`select tstzrange(starts_at,ends_at,'[)') @> starts_at, tstzrange(starts_at,ends_at,'[)') @> ends_at from public.app_announcements where id=${literal(adjacent.id)};`),'t|f');
 console.log('PASS adjacent scheduling and inclusive-start/exclusive-end boundary');
 const overlap1=create('overlap-draft-one',input("clock_timestamp()+interval '3 hours'","clock_timestamp()+interval '4 hours'"));
 const overlap2=create('overlap-draft-two',input("clock_timestamp()+interval '3 hours'","clock_timestamp()+interval '4 hours'"));
 const races=await Promise.all([
   run(`${staff}${command(overlap1,'publish','overlap-publish-one')}select pg_sleep(0.3);commit;`),
   run(`${staff}${command(overlap2,'publish','overlap-publish-two')}commit;`),
 ]);
 assert.equal(races.filter(r=>!r.error).length,1);
 assert.ok(races.some(r=>r.stderr.includes('overlaps')));
 console.log('PASS concurrent overlapping publication: exactly one commits');
 sync(`${staff}${command(campaign,'cancel','cancel-first-campaign')}commit;`);
 const before=sync("select count(*) from public.spark_ledger where reason='announcement_completion';");
 sync(`${prefix(member)}${submit('Future announcements cannot reward this submission','future-not-qualified')}commit;`);
 assert.equal(sync("select count(*) from public.spark_ledger where reason='announcement_completion';"),before);
 console.log('PASS cancellation-first and future-only campaigns pay no bonus');

 let concurrent=create('cancel-race-create',input("clock_timestamp()-interval '1 minute'",`${literal(boundary)}::timestamptz`));
 concurrent=jsonResult(sync(`${staff}${command(concurrent,'publish','cancel-race-publish')}commit;`));
 // Wait for a member's accepted completion, then cancel while its transaction is open.
 const held=execFile(podman,args(db),{encoding:'utf8'});
 let unlock!:()=>void;
 const accepted=new Promise<void>(resolve=>{unlock=resolve;});
 assert.ok(held.stdout&&held.stderr&&held.stdin);
 held.stdout.on('data',chunk=>{if(chunk.includes('completion_accepted'))unlock();});
 let errors=''; held.stderr.on('data',chunk=>{errors+=chunk;});
 const done=new Promise<void>((resolve,reject)=>{held.on('error',reject);held.on('exit',code=>code===0?resolve():reject(Error(errors)));});
 held.stdin.end(`${prefix(member)}${submit('A completion accepted just before cancellation','cancel-race-submission')}\n\\echo completion_accepted\nselect pg_sleep(1);commit;`);
 await Promise.race([accepted,done.then(()=>{throw Error('Missing completion marker');})]);
 sync(`${staff}${command(concurrent,'cancel','cancel-race-cancel')}commit;`);
 await done;
 assert.equal(sync(`select count(*) from public.app_announcement_completions where announcement_id=${literal(concurrent.id)};`),'1');
 sync(`${prefix(second)}${submit('A submission after cancellation cannot qualify','cancel-race-after')}commit;`);
 assert.equal(sync(`select count(*) from public.app_announcement_completions where announcement_id=${literal(concurrent.id)};`),'1');
 console.log('PASS cancellation race: accepted in-flight completion retained; later submission excluded');

 const expired=create('expired-reward-draft',input("clock_timestamp()-interval '2 hours'","clock_timestamp()-interval '1 hour'"));
 const denied=await run(`${staff}${command(expired,'publish','expired-reward-publish')}commit;`);
 assert.ok(denied.error&&denied.stderr.includes('expired'));
 console.log('PASS expired campaign cannot be published');

 const baselineLedger=sync("select count(*)||':'||sum(delta) from public.spark_ledger where reason='announcement_completion';");
 sync(readFileSync('docs/drafts/announcement_campaigns_v1.rollback.sql','utf8'));
 assert.equal(sync("select count(*)||':'||sum(delta) from public.spark_ledger where reason='announcement_completion';"),baselineLedger);
 sync(`${prefix(second)}${submit('Submission after rollback still works normally','campaign-rollback-safe')}commit;`);
 assert.equal(sync("select count(*)||':'||sum(delta) from public.spark_ledger where reason='announcement_completion';"),baselineLedger);
 const paused = await run(`update public.app_announcements set enabled=true where id=${literal(campaign.id)};`);
 assert.ok(paused.error && paused.stderr.includes('announcement_rewards_paused'));
 console.log('PASS rollback retains rewards/history, blocks reward republication and restores normal member submission');
} catch(error) { console.error(errorOutput(error,'stderr')); process.exitCode=1; }
finally {
 if(created) { sync(`drop database ${db};`,'postgres'); console.log('Removed only this run’s disposable QA database; original fixtures retained.'); }
}
