// Synthetic offline full-schema clone. Never contacts hosted services.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const podman='C:/Program Files/RedHat/Podman/podman.exe';
const container='supabase_db_employee-cutover-verify';
const info=JSON.parse(execFileSync(podman,['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.HostConfig.NetworkMode,'none');
assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
const db=`suggestion_policy_qa_${Date.now()}`;
assert.match(db,/^suggestion_policy_qa_[0-9]+$/);
const query=(sql,d=db)=>execFileSync(podman,['exec','-i',container,'psql','-X','-U','postgres','-d',d,'-At','-v','ON_ERROR_STOP=1'],{input:sql,encoding:'utf8',maxBuffer:8e6,stdio:['pipe','pipe','pipe']}).trim();
const read=p=>readFileSync(p,'utf8');
let created=false;
try {
 assert.equal(query("select count(*) from auth.users where email is null or email not like '%@test.invalid';select count(*) from vault.secrets;",'postgres'),'0\n0');
 query(`create database ${db} template postgres;`,'postgres'); created=true;
 query(read('supabase/migrations/20260927030000_employee_editorial_workflows.sql'));
 query(read('supabase/migrations/20260927040000_announcement_campaigns.sql'));
 query(read('supabase/migrations/20260927050000_community_idea_retriage.sql'));
 query(`begin;${read('scripts/test-editorial-local.sql')}reset role;commit;`);
 const member=query("select id from public.profiles where username='editorial_test';");
 const employee=query("select id from public.admin_employees where 'super_admin'=any(roles) limit 1;");
 const readAs=(id,sql,role='authenticated')=>query(`begin;set local statement_timeout='3s';select set_config('request.jwt.claims','${JSON.stringify({sub:id,role,aal:role==='doji_employee'?'aal2':'aal1'})}',true);set local role ${role};${sql};rollback;`).split('\n').filter(x=>!['BEGIN','ROLLBACK','SET'].includes(x)).slice(1).join('\n');
 const deny=(fn,fragment)=>{try{fn();assert.fail('Expected permission rejection');}catch(e){assert.ok(e.stderr?.toString().includes(fragment),e.stderr?.toString()||e.message);}};
 deny(()=>readAs(member,'select count(*) from public.challenge_suggestions'),'permission denied for table profiles');
 const snapshotSql="select jsonb_object_agg(p.oid::regprocedure::text,jsonb_build_array(pg_get_functiondef(p.oid),p.proacl)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f';";
 const functions=query(snapshotSql);
 const grants=query("select jsonb_agg(jsonb_build_array(oid::regclass::text,relacl,relrowsecurity,relforcerowsecurity) order by oid) from pg_class where relnamespace='public'::regnamespace;");
 const oldPolicies=JSON.parse(query("select jsonb_agg(p order by policyname) from pg_policies p where schemaname='public' and tablename='challenge_suggestions';"));
 query(read('supabase/migrations/20260928020000_repair_suggestion_profile_policy.sql'));
 assert.equal(query(snapshotSql),functions);
 assert.equal(query("select jsonb_agg(jsonb_build_array(oid::regclass::text,relacl,relrowsecurity,relforcerowsecurity) order by oid) from pg_class where relnamespace='public'::regnamespace;"),grants);
 const count=Number(query('select count(*) from public.challenge_suggestions;'));
 assert.ok(count>=2);
 const other='00000000-0000-4000-8000-000000000001';
 query(`insert into auth.users (id,email,role,aud,raw_user_meta_data) values ('${other}','policy-other@test.invalid','authenticated','authenticated',jsonb_build_object('terms_version','2026-08-20','privacy_version','2026-08-20','terms_accepted_at',now(),'privacy_accepted_at',now()));
 insert into public.profiles (id,username,display_name) values ('${other}','policy_other','Synthetic other member') on conflict(id) do nothing;
 insert into public.challenge_suggestions (user_id,kind,body,body_hash,options) values ('${other}','question','Synthetic other member question?','policy-other-question','[]');`);
 assert.equal(readAs(member,'select count(*) from public.challenge_suggestions'),String(count));
 assert.equal(readAs(other,'select count(*) from public.challenge_suggestions'),'1');
 assert.equal(readAs(other,`select count(*) from public.challenge_suggestions where user_id='${member}'`),'0');
 assert.equal(readAs(member,'select count(*) from public.challenge_suggestions where user_id<>auth.uid()'),'0');
 assert.equal(readAs(member,'select count(*) from public.challenge_suggestions s left join public.profiles p on p.id=s.reviewed_by'),String(count));
 deny(()=>readAs(member,'select is_admin from public.profiles limit 1'),'permission denied for table profiles');
 deny(()=>readAs(member,'update public.challenge_suggestions set status=\'approved\' where false'),'permission denied for table challenge_suggestions');
 deny(()=>readAs(employee,'select count(*) from public.challenge_suggestions','doji_employee'),'permission denied for table challenge_suggestions');
 assert.equal(readAs(member,'select count(*) from public.challenge_suggestions','anon'),'0');
 assert.equal(readAs(employee,"select jsonb_array_length(public.get_admin_editorial_page_v1('suggestions',25)->'items')",'doji_employee'),String(count+1));
 query(`update public.profiles set is_admin=true where id='${member}';`);
 assert.equal(readAs(member,'select public.is_current_user_admin()'),'t');
 assert.equal(readAs(member,'select count(*) from public.challenge_suggestions'),String(count+1));
 // Restore exact previous predicates and prove the regression is recoverable.
 query('begin;'+oldPolicies.filter(p=>p.cmd==='SELECT'||p.cmd==='UPDATE').map(p=>`alter policy ${p.policyname} on public.challenge_suggestions using (${p.qual});`).join('\n')+'commit;');
 deny(()=>readAs(member,'select count(*) from public.challenge_suggestions'),'permission denied for table profiles');
 console.log('PASS: reproduced old failure; own/other/anonymous/employee/legacy-admin reads, safe reviewer join, private-profile denial, direct-write denial, unchanged function/grant fingerprints and exact rollback.');
} catch(error) {console.error(error.stderr?.toString()||error.stack);process.exitCode=1;}
finally {if(created)query(`drop database ${db};`,'postgres');}
