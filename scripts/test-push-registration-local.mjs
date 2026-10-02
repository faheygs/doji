// Full-schema, synthetic-only local verification. No URL/credential/target overrides.
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
const podman='C:/Program Files/RedHat/Podman/podman.exe';
const args=['exec','-i','supabase_db_employee-cutover-verify','psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'];
const sql=s=>execFileSync(podman,args,{input:s,encoding:'utf8',timeout:30_000}).trim();
const json=s=>JSON.parse(sql(s));
const live=JSON.parse(readFileSync('test-results/push-registration-release-20260926/before.json','utf8'));
const migration=readFileSync('supabase/migrations/20260926050000_skip_unchanged_push_profile_update.sql','utf8');
const original=sql("select pg_get_functiondef('public.register_push_token(text)'::regprocedure);");
const contracts=()=>json(`select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_object('hash',md5(pg_get_functiondef(p.oid)),'acl',p.proacl::text)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';`);
const before=contracts();
for(const [name,contract] of Object.entries(before)) {
  if (name.startsWith('register_native_push_endpoint(')||name.startsWith('register_native_push_endpoint_v')||name==='register_push_token(text)') {
    assert.equal(contract.hash,live.functions[name]?.hash,`Local/live definition ${name}`);
    assert.equal(contract.acl,live.functions[name]?.acl,`Local/live grants ${name}`);
  }
}
assert.equal(sql("select (select count(*) from vault.secrets)+(select count(*) from auth.users where email is null or email not like '%@test.invalid')+(select count(*) from public.profiles);"),'0','Exclusive synthetic local database required');
const ids=Array.from({length:6},()=>randomUUID());
const eventId=randomUUID(),challengeId=randomUUID(),postId=randomUUID();
const idList=ids.map(id=>`'${id}'`).join(',');
mkdirSync('test-results/push-registration-release-20260926',{recursive:true});
writeFileSync('test-results/push-registration-release-20260926/local-fixtures.json',JSON.stringify(ids));
const claims=id=>`select set_config('request.jwt.claims','${JSON.stringify({sub:id,role:'authenticated',aal:'aal1'})}',true);`;
const call=(id,index=0,expo=`synthetic-expo-${id}`,platform='ios',native=`synthetic-native-${id}-${index}`)=>
  `select public.register_native_push_endpoint_v3('synthetic-install-${index}','${native}','${platform}','sandbox',${expo===null?'null':`'${expo}'`},2::smallint,'1.0.8','98','testflight');`;
const command=(id,body)=>`begin; set local statement_timeout='8s'; ${claims(id)} set local role authenticated; ${body} commit;`;
function asyncSql(s) {
  const child=spawn(podman,args,{stdio:['pipe','pipe','pipe']});
  let output='',errors='';
  let readyResolve;
  const ready=new Promise(resolve=>{readyResolve=resolve;});
  child.stdout.on('data',chunk=>{output+=chunk; if(output.includes('HOLDER_READY')) readyResolve();});
  child.stderr.on('data',chunk=>{errors+=chunk;});
  const done=new Promise((resolve,reject)=>{
    child.on('error',reject);
    child.on('close',code=>code===0?resolve(output):reject(new Error(errors)));
  });
  child.stdin.end(s);
  return {ready,done,child};
}
const assertSql=(condition,message)=>sql(`do $$ begin if not (${condition}) then raise exception '${message}'; end if; end $$;`);
const record={checks:[],measurements:{}};
let setup=false;
try {
  sql(`begin;
    insert into auth.users(id,email,role,aud,raw_user_meta_data) values ${ids.map(id=>`('${id}','${id}@test.invalid','authenticated','authenticated',jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()))`).join(',')};
    insert into public.profiles(id,username,display_name) values ${ids.map((id,i)=>`('${id}','push_fixture_${i}','Synthetic fixture')`).join(',')};
    create schema doji_push_probe;
    create table doji_push_probe.updates(profile_id uuid);
    create function doji_push_probe.observe() returns trigger language plpgsql security definer set search_path='' as $probe$
    begin insert into doji_push_probe.updates values(new.id); return new; end $probe$;
    create trigger doji_push_probe_update after update on public.profiles for each row execute function doji_push_probe.observe();
    commit;`);
  setup=true;
  sql(command(ids[0],call(ids[0])));
  const repeat=(label)=>{
    sql('truncate doji_push_probe.updates;');
    const t=performance.now();
    sql(`begin; ${claims(ids[0])} set local role authenticated; do $$ begin for i in 1..40 loop ${call(ids[0]).replace('select public.','perform public.')} end loop; end $$; commit;`);
    const value={profileUpdates:Number(sql('select count(*) from doji_push_probe.updates;')),wallMs:Math.round(performance.now()-t),registrations:40};
    record.measurements[label]=value;
    return value;
  };
  assert.equal(repeat('baseline').profileUpdates,40);
  const oldRegisteredAt=sql(`select last_registered_at from public.device_push_endpoints where user_id='${ids[0]}';`);
  sql(`begin; ${migration} commit;`);
  const after=contracts();
  assert.equal(Object.keys(after).length,Object.keys(before).length);
  for(const [name,contract] of Object.entries(before)) {
    if(name==='register_push_token(text)') assert.equal(after[name].acl,contract.acl);
    else assert.deepEqual(after[name],contract,`Unchanged ${name}`);
  }
  record.candidateHash=after['register_push_token(text)'].hash;
  assert.equal(repeat('candidate').profileUpdates,0);
  assertSql(`(select last_registered_at > '${oldRegisteredAt}'::timestamptz from public.device_push_endpoints where user_id='${ids[0]}')`,'Endpoint freshness must still advance');
  record.checks.push('40 full-v3 repeated registrations: 40 -> 0 profile updates; endpoint freshness preserved');
  assertSql(`(select notification_contract_version=2 and app_version='1.0.8' and native_build_number='98' and active from public.device_push_endpoints where user_id='${ids[0]}')`,'Endpoint metadata unchanged');
  // Both installed native platforms and v1/v2 remain available; no fallback token is required.
  sql(command(ids[1],call(ids[1],0,null,'android')));
  sql(command(ids[1],`select public.register_native_push_endpoint('legacy-one','legacy-native-one','ios','sandbox',null); select public.register_native_push_endpoint_v2('legacy-two','legacy-native-two','android','sandbox',null,2::smallint);`));
  record.checks.push('Android/iOS and v1/v2/v3 compatibility');
  // Rotation and transfer preserve uniqueness, including native ownership transfer.
  sql(command(ids[0],call(ids[0],0,'synthetic-expo-rotated-token')));
  sql(command(ids[1],call(ids[1],0,'synthetic-expo-rotated-token','ios',`synthetic-native-${ids[0]}-0`)));
  assertSql(`(select notification_token is null from public.profiles where id='${ids[0]}') and (select notification_token='synthetic-expo-rotated-token' from public.profiles where id='${ids[1]}')`,'Transfer failed');
  assertSql(`(select count(*)=1 from public.device_push_endpoints where token='synthetic-native-${ids[0]}-0' and user_id='${ids[1]}')`,'Native transfer failed');
  record.checks.push('Rotation and cross-account native/Expo transfer');
  const endpoints=sql(`select jsonb_agg(to_jsonb(e) order by id) from public.device_push_endpoints e where user_id='${ids[1]}';`);
  assert.throws(()=>sql(command(ids[1],call(ids[1],0,'short'))),/Invalid push token/);
  assert.equal(sql(`select jsonb_agg(to_jsonb(e) order by id) from public.device_push_endpoints e where user_id='${ids[1]}';`),endpoints);
  // Profile edit guard is still active; this ordinary edit is deliberately rejected.
  assert.throws(()=>sql(`update public.profiles set bio='shit' where id='${ids[1]}';`),/Content contains prohibited language/);
  record.checks.push('Failure after endpoint replacement rolls back old active endpoints; real UGC edits still validated');
  assert.throws(()=>sql("begin; select set_config('request.jwt.claims','{}',true); select public.register_push_token('synthetic-expo-missing-auth'); commit;"),/Authentication required/);
  const missing=randomUUID();
  assert.throws(()=>sql(`begin; ${claims(missing)} select public.register_push_token('synthetic-expo-rotated-token'); commit;`),/Profile not found/);
  assertSql(`(select notification_token='synthetic-expo-rotated-token' from public.profiles where id='${ids[1]}')`,'Failed transfer did not rollback');
  record.checks.push('Anonymous, invalid-token and missing-profile failures retain prior ownership');
  // Same-token concurrent transfer must wait for the same transaction advisory lock.
  const common='synthetic-expo-concurrent-shared-token';
  const holder=asyncSql(`begin; set local application_name='doji-push-holder'; set local statement_timeout='12s'; ${claims(ids[2])} set local role authenticated; ${call(ids[2],0,common)} select pg_sleep(8); commit;`);
  // Inspect server state, not buffered child stdout, to establish the barrier.
  let ready=false;
  for(let i=0;i<6&&!ready;i++) {
    await new Promise(resolve=>setTimeout(resolve,100));
    ready=sql("select exists(select 1 from pg_stat_activity where application_name='doji-push-holder' and wait_event='PgSleep');")==='t';
  }
  assert.ok(ready,'Holder must reach the server-side barrier');
  const waiter=asyncSql(`begin; set local application_name='doji-push-waiter'; set local statement_timeout='8s'; ${claims(ids[3])} set local role authenticated; ${call(ids[3],0,common)} commit;`);
  record.measurements.tokenTransferBlocked=false;
  for(let i=0;i<6&&!record.measurements.tokenTransferBlocked;i++) {
    await new Promise(resolve=>setTimeout(resolve,100));
    record.measurements.tokenTransferBlocked=sql("select exists(select 1 from pg_stat_activity where application_name='doji-push-waiter' and cardinality(pg_blocking_pids(pid))>0);")==='t';
  }
  await Promise.all([holder.done,waiter.done]);
  assert.equal(record.measurements.tokenTransferBlocked,true);
  assertSql(`(select count(*)=1 from public.profiles where notification_token='${common}') and (select notification_token='${common}' from public.profiles where id='${ids[3]}')`,'Concurrent token ownership failed');
  // Two simultaneous registrations for one installation are also serialized by the unchanged native contract.
  await Promise.all(Array.from({length:4},()=>asyncSql(command(ids[4],call(ids[4]))).done));
  assertSql(`(select count(*)=1 from public.device_push_endpoints where user_id='${ids[4]}')`,'Concurrent installation duplicated');
  record.checks.push('Concurrent token transfer and repeated installation registration serialize without duplicates');
  // Bounded mixed workload, with real RPCs and synthetic media reservations.
  sql(`begin;
    insert into public.challenges(id,title,description,category) values('${challengeId}','Push regression fixture','Synthetic only','creative');
    insert into public.daily_events(id,challenge_id,fires_at) values('${eventId}','${challengeId}',now()-interval '2 minutes');
    insert into public.user_events(id,user_id,daily_event_id,status,expires_at) values
      ${ids.map(id=>`('${id}','${id}','${eventId}','completed',now()+interval '8 minutes')`).join(',')};
    insert into storage.buckets(id,name) values('post-media','post-media') on conflict do nothing;
    insert into storage.objects(bucket_id,name,owner_id) values('post-media','${postId}.jpg','${ids[0]}');
    insert into public.media_upload_intents(user_id,user_event_id,idempotency_key,slot,object_path,content_type)
      values('${ids[0]}','${ids[0]}','${postId}','photo','${postId}.jpg','image/jpeg');
    insert into public.posts(id,user_id,user_event_id,daily_event_id,idempotency_key,photo_url)
      values('${postId}','${ids[0]}','${ids[0]}','${eventId}','${postId}','https://test.invalid/storage/v1/object/public/post-media/${postId}.jpg');
    commit;`);
  const employee=sql("select id from public.admin_employees where status='active' and 'super_admin'=any(roles) limit 1;");
  const work=ids.map(id=>command(id,`${call(id)} select public.set_post_reaction('${postId}','heart',true,'mixed-${randomUUID()}');
    select public.get_notification_center_snapshot(now()-interval '1 day',20);
    select public.get_own_profile(); select public.get_feed_page_snapshot_v2('${eventId}','everyone',10,null,null);
    select public.get_comment_thread_snapshot('${postId}','everyone',null,null,20);`));
  work.push(`begin; set local statement_timeout='8s'; select set_config('request.jwt.claims','{"sub":"${employee}","role":"doji_employee","aal":"aal2"}',true); set local role doji_employee; select public.get_admin_operational_health_read_v1(); rollback;`);
  work.push("begin; set local statement_timeout='8s'; select count(*) from public.claim_domain_events_v2(10); rollback;");
  const mixedStart=performance.now();
  const mixedResults=await Promise.allSettled(work.map(statement=>asyncSql(statement).done));
  assert.ok(mixedResults.every(result=>result.status==='fulfilled'),JSON.stringify(mixedResults.filter(result=>result.status==='rejected').map(result=>result.reason.message)));
  record.measurements.mixedWorkload={concurrentTransactions:work.length,wallMs:Math.round(performance.now()-mixedStart),failures:0};
  assertSql(`(select count(*)=6 from public.reactions where post_id='${postId}')`,'Mixed reactions missing');
  record.checks.push('Concurrent member registration/reactions/profile/feed/comments/notification reads, employee health read and relay claim');
  // The narrow migration is intentionally not blindly replayable on an unexpected baseline.
  assert.throws(()=>sql(`begin; ${migration} commit;`),/baseline drift/);
  record.checks.push('Migration drift guard and unchanged public function/grant contracts');
  record.status='passed';
} catch(error) {
  console.error('Local test failure:',error.message);
  throw error;
} finally {
  sql(`begin; ${original}; commit;`);
  if(setup) sql(`begin; drop trigger doji_push_probe_update on public.profiles; drop function doji_push_probe.observe(); drop table doji_push_probe.updates; drop schema doji_push_probe;
    delete from auth.users where id in (${idList}) and email=id::text||'@test.invalid';
    delete from public.daily_events where id='${eventId}'; delete from public.challenges where id='${challengeId}';
    select set_config('storage.allow_delete_query','true',true);
    delete from storage.objects where bucket_id='post-media' and name='${postId}.jpg'; commit;`);
  assert.deepEqual(contracts(),before,'Local function definitions/grants restored');
  assert.equal(sql(`select count(*) from auth.users where id in (${idList});`),'0','Own synthetic accounts cleaned up');
}
mkdirSync('test-results/push-registration-release-20260926',{recursive:true});
writeFileSync('test-results/push-registration-release-20260926/local-tests.json',JSON.stringify(record,null,2));
console.log(JSON.stringify(record,null,2));
