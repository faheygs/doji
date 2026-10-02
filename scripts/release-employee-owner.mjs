// Exact owner-approved mapping. No Auth credential/session or permission changes.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {cli,hash} from './prepare-safety-launch.mjs';
const root='test-results/employee-owner-binding-20261001';
const id='ae62514b-d022-4845-9933-2d10689b5105';
const subject='user_01M3W4BF7Y2C1V3216DYNCJ2N3';
const client='client_01M3VE4WTBYS2XN6NZPH9EDMQD';
const issuer=`https://api.workos.com/user_management/${client}`;
const scope=hash(`https://admin.dojipro.com|${client}`);
const mode=process.argv[2];assert.ok(['prepare','rehearse','apply','verify'].includes(mode));
const query=s=>cli(['db','query',s,'--linked','--output-format','json']).rows;
const save=(n,v)=>writeFile(`${root}/${n}.json`,JSON.stringify(v,null,2),{flag:'wx'});
const read=async n=>JSON.parse(await readFile(`${root}/${n}.json`,'utf8'));
const contract=`select md5(jsonb_build_object('functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid) from pg_proc p where p.prokind='f' and p.pronamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace)),'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in('public','auth','storage','business_private')))::text)`;
const state=()=>query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'contract',(${contract}),
 'legacy',(select jsonb_build_object('id',id,'email',email,'role',role,'type',raw_app_meta_data->>'account_type','deleted',deleted_at,'banned',banned_until>clock_timestamp(),'hash',md5(to_jsonb(u)::text)) from auth.users u where id='${id}'),
 'employee',(select to_jsonb(e) from public.admin_employees e where id='${id}'),
 'actor',(select to_jsonb(a) from portal_identity_private.staff_actors a where id='${id}'),
 'realm',(select to_jsonb(r) from portal_identity_private.realms r where realm='employee'),
 'principal',(select to_jsonb(p) from portal_identity_private.principals p where id='${id}'),
 'contact',(select to_jsonb(c) from portal_identity_private.employee_contacts c where id='${id}'),
 'identity',(select to_jsonb(i) from portal_identity_private.identities i where realm='employee' and subject='${subject}'),
 'session',(select to_jsonb(s) from employee_session_private.settings s where singleton),
 'rpc',(select enabled from portal_identity_private.employee_rpc_settings where singleton),
 'wrong_realm',exists(select 1 from public.profiles where id='${id}') or exists(select 1 from business_private.accounts where id='${id}'),
 'active_event',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1)
 ) state;rollback;`)[0].state;
await mkdir(root,{recursive:true});
if(mode==='prepare'){
 const output=execFileSync(process.execPath,['scripts/invite-employee-owner.mjs'],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
 const provider=JSON.parse(output);assert.equal(provider.invitation.state,'accepted');assert.equal(provider.owner.subject,subject);
 assert.equal(provider.owner.emailVerified,true);assert.equal(provider.owner.totpFactorCount,1);
 const before=state();assert.equal(before.legacy.email,'gfahey@dojipro.com');assert.equal(before.legacy.role,'doji_employee');assert.equal(before.legacy.type,'employee');
 assert.equal(before.employee.status,'active');assert.ok(before.employee.roles.includes('super_admin'));
 assert.equal(before.actor.legacy_auth_id,id);assert.equal(before.actor.employee_principal_id,null);
 for(const key of ['realm','principal','contact','identity'])assert.equal(before[key],null,key);
 assert.equal(before.wrong_realm,false);assert.equal(before.active_event,false);assert.equal(before.rpc,false);assert.equal(before.session.enabled,false);
 const sql=`begin;set local lock_timeout='2s';set local statement_timeout='8s';
 do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('employee-owner-cutover-v1',0)) then raise exception 'Concurrent owner release';end if;
 perform pg_advisory_xact_lock(92610001);
 if (${contract})<>'${before.contract}' then raise exception 'Contract drift';end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp()) then raise exception 'Event window';end if;
 perform 1 from auth.users where id='${id}' for share;
 perform 1 from public.admin_employees where id='${id}' for update;
 if (select md5(to_jsonb(u)::text) from auth.users u where id='${id}')<>'${before.legacy.hash}' then raise exception 'Legacy identity drift';end if;
 if (select md5(to_jsonb(e)::text) from public.admin_employees e where id='${id}')<>md5($row$${JSON.stringify(before.employee)}$row$::jsonb::text) then raise exception 'Staff permissions drift';end if;
 if exists(select 1 from portal_identity_private.realms where realm='employee') or (select enabled from employee_session_private.settings where singleton) or (select enabled from portal_identity_private.employee_rpc_settings where singleton) then raise exception 'Gates changed';end if;
 end$$;
 insert into portal_identity_private.realms(realm,issuer,audience,enabled) values('employee','${issuer}','${client}',true);
 select portal_identity_private.bind_identity('employee','${subject}','${id}','Owner-approved verified WorkOS invitation 2026-10-01');
 select portal_identity_private.prepare_employee_actor_v1('${id}','Owner-approved exact staff identity retention 2026-10-01');
 select portal_identity_private.set_principal_state('${id}',1,'active','Owner-approved employee canary access 2026-10-01');
 insert into portal_identity_private.employee_contacts(id,email,verified_at) values('${id}','gfahey@dojipro.com',clock_timestamp());
 update employee_session_private.settings set enabled=true,scope_hash='${scope}' where singleton and not enabled;
 update portal_identity_private.employee_rpc_settings set enabled=true where singleton and not enabled;
 do $$begin
 if (${contract})<>'${before.contract}' or (select md5(to_jsonb(u)::text) from auth.users u where id='${id}')<>'${before.legacy.hash}' then raise exception 'Existing contract or Auth identity changed';end if;
 end$$;commit;`;
 await writeFile(`${root}/apply.sql`,sql,{flag:'wx'});
 await writeFile(`${root}/rehearse.sql`,sql.replace(/commit;$/,'rollback;'),{flag:'wx'});
 await writeFile(`${root}/rollback.sql`,`begin;set local lock_timeout='2s';set local statement_timeout='5s';
 update portal_identity_private.realms set enabled=false where realm='employee' and audience='${client}';
 update employee_session_private.settings set enabled=false where singleton;
 update portal_identity_private.employee_rpc_settings set enabled=false where singleton;
 -- Preserve explicit mapping and history; legacy Auth identity and permissions remain usable.
 commit;`,{flag:'wx'});
 await save('candidate',{at:new Date().toISOString(),before,sqlHash:hash(sql),provider:{subject,emailVerified:true,totp:true}});
 console.log('Exact owner binding prepared; no member/account changes applied.');
}else{
 const c=await read('candidate'),sql=await readFile(`${root}/apply.sql`,'utf8');assert.equal(hash(sql),c.sqlHash);
 if(mode==='rehearse'||mode==='apply'){
  assert.deepEqual(state(),c.before);
  if(mode==='apply'){await read('rehearsed');await assert.rejects(access(`${root}/started.json`));await save('started',{at:new Date().toISOString()});}
  cli(['db','query','--file',`${root}/${mode==='apply'?'apply':'rehearse'}.sql`,'--linked','--output-format','json']);
  if(mode==='rehearse'){assert.deepEqual(state(),c.before);await save('rehearsed',{sqlHash:c.sqlHash,at:new Date().toISOString()});console.log('Exact mapping/gates rehearsal rolled back; existing owner and contracts unchanged.');process.exit(0);}
 }
 const after=state();assert.equal(after.contract,c.before.contract);assert.deepEqual(after.legacy,c.before.legacy);assert.deepEqual(after.employee,c.before.employee);
 assert.equal(after.identity.principal_id,id);assert.equal(after.principal.state,'active');assert.equal(after.actor.employee_principal_id,id);assert.equal(after.actor.legacy_auth_id,null);
 assert.equal(after.session.scope_hash,scope);assert.equal(after.session.enabled,true);assert.equal(after.rpc,true);assert.equal(after.realm.enabled,true);
 await save('verified-'+Date.now(),{at:new Date().toISOString(),subject,principal:id,existingAuthAndPermissionsUnchanged:true,contractUnchanged:true,ownerCanaryReady:true});
 console.log('Independent owner mapped, employee-only gates enabled; existing Auth and permissions unchanged.');
}
