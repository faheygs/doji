// Disposable clone of the synthetic, network-isolated local database only.
import {execFileSync,execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const run=promisify(execFile),podman='C:/Program Files/RedHat/Podman/podman.exe',container='supabase_db_employee-cutover-verify';
const info=JSON.parse(execFileSync(podman,['inspect',container],{encoding:'utf8'}))[0];
assert.equal(info.HostConfig.NetworkMode,'none');assert.equal(Object.keys(info.HostConfig.PortBindings||{}).length,0);
const db=`safety_test_${process.pid}_${Date.now()}`;assert.match(db,/^safety_test_\d+_\d+$/);
const args=database=>['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-At','-v','ON_ERROR_STOP=1'];
const sql=(database,query)=>execFileSync(podman,args(database),{input:query,encoding:'utf8',stdio:['pipe','pipe','pipe']});
const quote=s=>`'${s.replaceAll("'","''")}'`;
let created=false;
try{
 sql('postgres',`do $$begin if exists(select 1 from vault.secrets) or exists(select 1 from auth.users where email is null or email not like '%@test.invalid') then raise exception 'Synthetic database required'; end if; end$$;`);
 sql('postgres',`create database ${db} template postgres;`);created=true;
 for(const file of ['external_takedown_intake_v1.sql','external_takedown_alerts_v1.sql'])sql(db,readFileSync(`docs/drafts/${file}`,'utf8'));
 const id='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',hash='a'.repeat(64),request=JSON.stringify({name:'Synthetic',contact:'test@test.invalid',relationship:'depicted',reason:'sexual_content',detail:'nonconsensual_intimate_images',location:'Offline fixture',statement:'Without consent',signature:'Synthetic',consent:true});
 const service=`select set_config('request.jwt.claims','{"role":"service_role"}',false);set role service_role;`;
 const query=`${service}select public.submit_safety_removal_v1('${id}','${hash}',${quote(request)});`;
 const results=await Promise.all(Array.from({length:8},()=>run(podman,[...args(db),'-c',query],{encoding:'utf8'})));
 assert.equal(results.length,8);assert.equal(sql(db,'select count(*) from public.safety_removal_cases;').trim(),'1');assert.equal(sql(db,'select count(*) from public.safety_removal_history;').trim(),'1');
 const employee=sql(db,"select id from public.admin_employees where 'super_admin'=any(roles) limit 1;").trim();assert.match(employee,/^[a-f0-9-]{36}$/);
 const staff=`select set_config('request.jwt.claims','{"role":"doji_employee","aal":"aal2","sub":"${employee}"}',false);set role doji_employee;`;
 const command=n=>`${staff}select public.admin_safety_removal_command_v1('${id}',1,'${n}1111111-1111-4111-8111-111111111111','{"action":"claim","note":"Concurrent synthetic review"}');`;
 const decisions=await Promise.allSettled([1,2].map(n=>run(podman,[...args(db),'-c',command(n)],{encoding:'utf8'})));
 assert.equal(decisions.filter(x=>x.status==='fulfilled').length,1);assert.ok(decisions.find(x=>x.status==='rejected').reason.stderr.includes('Case changed'));
 const leases=await Promise.all(Array.from({length:4},()=>run(podman,[...args(db),'-c',`${service}select jsonb_array_length(public.claim_safety_removal_alerts_v1('{"from":"Doji <test@test.invalid>","to":"faheygs@gmail.com"}'));`],{encoding:'utf8'})));
 assert.equal(leases.reduce((sum,r)=>sum+Number(r.stdout.trim().split('\n').at(-1)),0),1);
 console.log('Concurrent receipts, conflicting staff decisions and alert leases passed in disposable offline clone.');
}finally{if(created)sql('postgres',`drop database ${db} with (force);`);}
