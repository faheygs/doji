// Real concurrent sessions; disposable clone of the synthetic offline DB only.
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const run=promisify(execFile),podman='C:/Program Files/RedHat/Podman/podman.exe',container='supabase_db_employee-cutover-verify';
const info=JSON.parse(execFileSync(podman,['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
const db=`media_test_${process.pid}_${Date.now()}`;assert.match(db,/^media_test_\d+_\d+$/);
const args=database=>['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'];
const sql=(database,query)=>execFileSync(podman,args(database),{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:8000000});
const parallel=query=>run(podman,[...args(db),'-c',query],{encoding:'utf8'});
const service=`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role;`;
const bridge=readFileSync('scripts/test-safety-removal-bridge.sql','utf8');
const fixture=bridge.slice(bridge.indexOf('do $$declare author'),bridge.indexOf('end$$;')+7);
const checks=readFileSync('scripts/test-moderation-media-restoration.sql','utf8');
const setup=checks.slice(0,checks.indexOf("select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);"));
assert.ok(setup.includes("test.appeal"));
let created=false;
try {
 sql('postgres',`do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic database required'; end if; end$$;`);
 sql('postgres',`create database ${db} template postgres;`);created=true;
 sql(db,readFileSync('supabase/migrations/20260927020000_employee_case_evidence.sql','utf8'));
 sql(db,readFileSync('docs/drafts/external_takedown_intake_v1.sql','utf8'));
 for(const name of ['ledger','restoration','cleanup','evidence','closure'])sql(db,readFileSync(`docs/drafts/moderation_media_${name}_v1.sql`,'utf8'));
 sql(db,`begin;${fixture}\n${setup}\ncommit;`);
 const employee=sql(db,"select id from public.admin_employees where 'super_admin'=any(roles) limit 1;").trim();
 const appeal=sql(db,'select id from public.moderation_appeals order by submitted_at desc limit 1;').trim();
 const staff=`select set_config('request.jwt.claims','{"role":"doji_employee","aal":"aal2","sub":"${employee}"}',false);set role doji_employee;`;
 const leases=await Promise.all(Array.from({length:8},()=>parallel(`${service}select public.claim_moderation_media_v1();`)));
 const jobs=leases.map(r=>r.stdout.trim().split('\n').at(-1)).filter(v=>v.startsWith('{')&&v.includes('lease_id')).map(JSON.parse);
 assert.equal(jobs.length,2);assert.equal(new Set(jobs.map(j=>j.id)).size,2,'exclusive claims');
 const review=await Promise.allSettled([parallel(`${staff}select public.admin_review_moderation_appeal('${appeal}','reverse','Concurrent synthetic review during active work','concurrent-media-review');`)]);
 assert.equal(review[0].status,'rejected');assert.ok(review[0].reason.stderr.includes('Media operation in progress'));
 const expired=jobs[0];
 sql(db,`update public.moderation_media_objects set lease_until=clock_timestamp()-interval '2 minutes' where id='${expired.id}';`);
 const reclaimed=await parallel(`${service}select public.claim_moderation_media_v1();`);
 const current=JSON.parse(reclaimed.stdout.trim().split('\n').at(-1));assert.equal(current.id,expired.id);assert.notEqual(current.lease_id,expired.lease_id);
 assert.equal(sql(db,`${service}select public.check_moderation_media_lease_v1('${expired.id}','${expired.lease_id}',${expired.revision});`).trim().split('\n').at(-1),'f');
 // Concurrent cleanup workers serialize the same eligible exact path.
 sql(db,`insert into storage.objects(bucket_id,name,version,metadata) values('post-media','race-cleanup.jpg','v1','{"size":7,"mimetype":"image/jpeg"}');insert into public.media_objects_pending_delete(bucket_id,object_path) values('post-media','race-cleanup.jpg');`);
 const cleanup=await Promise.all(Array.from({length:8},()=>parallel(`${service}select jsonb_array_length(public.claim_media_cleanup_v1('post-media',array['race-cleanup.jpg']));`)));
 assert.equal(cleanup.reduce((n,r)=>n+Number(r.stdout.trim().split('\n').at(-1)),0),1);
 // Actual staff reversals after leases are released race safely via existing RPC.
 sql(db,`update public.moderation_media_objects set lease_id=null,lease_until=null;`);
 const reversals=await Promise.allSettled([1,2].map(n=>parallel(`${staff}select public.admin_review_moderation_appeal('${appeal}','reverse','Independent concurrent synthetic review','concurrent-media-review-${n}');`)));
 assert.equal(reversals.filter(x=>x.status==='fulfilled').length,1);
 assert.equal(sql(db,"select count(*) from public.moderation_media_objects where desired='restored';").trim(),'2');
 console.log('Concurrent media claims, active-work reversal denial, stale-lease fencing, cleanup exclusivity and conflicting real appeal RPCs passed in the isolated clone.');
} finally { if(created)sql('postgres',`drop database ${db} with (force);`); }
