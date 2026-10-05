// Narrow server-only transport credential. Does not enable a realm, map an
// employee, touch Auth rows, change existing grants, or switch a portal.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { randomBytes, pbkdf2Sync, createHash, createHmac } from 'node:crypto';
import { cli, ref, hash } from './prepare-safety-launch.mts';
import { createRequire } from 'node:module';
// Use the portal runtime's declared/pinned driver, not an undeclared root dependency.
const pg = createRequire(new URL('../infra/portal-identity-candidate/package.json', import.meta.url))('pg') as typeof import('pg');
import {evidenceRecord,evidenceAt,evidenceRows} from './release-evidence.mts';
import type {RestrictedSqlConfig} from '../infra/portal-identity-candidate/restricted-sql.mts';
import type {SqlParameter} from '../infra/portal-identity-candidate/employee-contracts.mts';
import { createRestrictedSql } from '../infra/portal-identity-candidate/restricted-sql.mts';

const mode = process.argv[2];
assert.ok(mode&&['prepare', 'rehearse', 'apply', 'verify'].includes(mode));
const root = 'test-results/employee-sql-login-20261001';
const secretRoot = '.artifacts/employee-runtime';
const credentialPath = `${secretRoot}/database.json`;
const login = 'doji_employee_portal_login';
const roles = ['doji_employee_application', 'doji_employee_session'] as const;
const query = (sql:string) => evidenceRows(cli(['db', 'query', sql, '--linked', '--output-format', 'json']));
const save = (name:string, value:unknown) => writeFile(`${root}/${name}.json`, JSON.stringify(value, null, 2), {flag:'wx'});
const read = async (name:string) => evidenceRecord(JSON.parse(await readFile(`${root}/${name}.json`, 'utf8')));
const fingerprint = `select md5(jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid) from pg_proc p where p.prokind='f' and p.pronamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace)),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in('public','auth','storage','business_private')),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid) from pg_class c where c.relnamespace in('public'::regnamespace,'auth'::regnamespace,'storage'::regnamespace,'business_private'::regnamespace) and c.relkind in('r','p','v','m'))
 )::text)`;
const state = () => evidenceRecord(query(`begin read only;set local statement_timeout='8s';select jsonb_build_object(
 'fingerprint',(${fingerprint}),
 'login_exists',exists(select 1 from pg_roles where rolname='${login}'),
 'session_enabled',(select enabled from employee_session_private.settings where singleton),
 'rpc_enabled',(select enabled from portal_identity_private.employee_rpc_settings where singleton),
 'active_event',exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1)
 ) state;rollback;`)[0]?.state);

// Verify effective permissions, including accidental PUBLIC grants; no table
// data needs to be read and no forbidden command needs to be attempted.
const guards = `do $check$ declare role_name text; begin
 if not exists(select 1 from pg_roles where rolname='${login}' and rolcanlogin
   and not (rolsuper or rolinherit or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
   and rolconnlimit=2) then raise exception 'Unsafe transport attributes';end if;
 if (select count(*) from pg_auth_members m where m.member='${login}'::regrole)<>2
 or exists(select 1 from pg_auth_members m where m.member='${login}'::regrole
   and (m.roleid not in('doji_employee_application'::regrole,'doji_employee_session'::regrole)
     or m.admin_option or m.inherit_option or not m.set_option)) then raise exception 'Unsafe membership';end if;
 foreach role_name in array array['${login}','doji_employee_application','doji_employee_session'] loop
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in('public','auth','storage','business_private','portal_identity_private','employee_session_private','business_session_private')
    and c.relkind in('r','p','v','m')
    and has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
    then raise exception 'Unexpected direct table access';end if;
  if pg_has_role(role_name,'authenticated','MEMBER') or pg_has_role(role_name,'service_role','MEMBER')
   or pg_has_role(role_name,'doji_business','MEMBER') or pg_has_role(role_name,'doji_employee','MEMBER')
   or pg_has_role(role_name,'doji_identity_resolver','MEMBER') then raise exception 'Cross-boundary membership';end if;
  if has_function_privilege(role_name,'portal_identity_private.bind_identity(text,text,uuid,text)','EXECUTE')
    then raise exception 'Identity mapping accessible';end if;
 end loop;
 if pg_has_role('authenticator','${login}','MEMBER') or pg_has_role('authenticated','${login}','MEMBER')
   or pg_has_role('service_role','${login}','MEMBER') then raise exception 'API can assume transport';end if;
 if (select enabled from employee_session_private.settings where singleton)
   or (select enabled from portal_identity_private.employee_rpc_settings where singleton)
   then raise exception 'Login gates must remain disabled';end if;
end $check$;`;

assert.equal((await readFile('supabase/.temp/project-ref','utf8')).trim(),ref);
await mkdir(root,{recursive:true});
if(mode==='prepare') {
 const before=state();
 assert.equal(before.login_exists,false);assert.equal(before.active_event,false);
 assert.equal(before.session_enabled,false);assert.equal(before.rpc_enabled,false);
 await assert.rejects(access(`${root}/candidate.json`),'Existing preparation must be inspected');
 await mkdir(secretRoot,{recursive:true});
 execFileSync('git',['check-ignore',credentialPath],{stdio:'pipe'});
 const owner=execFileSync('whoami',[],{encoding:'utf8'}).trim();
 execFileSync('icacls',[secretRoot,'/inheritance:r','/grant:r',`${owner}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{stdio:'pipe'});
 const pooler=new URL((await readFile('supabase/.temp/pooler-url','utf8')).trim());
 assert.equal(pooler.hostname,'aws-1-us-west-2.pooler.supabase.com');
 const config={realm:'employee',host:pooler.hostname,projectRef:ref,port:6543,database:'postgres',username:`${login}.${ref}`,password:randomBytes(48).toString('base64url')};
 await writeFile(credentialPath,JSON.stringify(config),{flag:'wx'});
 // Do not put plaintext credentials in CLI arguments or database statements.
 const salt=randomBytes(16), salted=pbkdf2Sync(config.password,salt,4096,32,'sha256');
 const clientKey=createHmac('sha256',salted).update('Client Key').digest();
 const stored=createHash('sha256').update(clientKey).digest('base64');
 const server=createHmac('sha256',salted).update('Server Key').digest('base64');
 const verifier=`SCRAM-SHA-256$4096:${salt.toString('base64')}$${stored}:${server}`;
 const sql=`begin;set local lock_timeout='2s';set local statement_timeout='8s';
 do $$begin
 if not pg_try_advisory_xact_lock(hashtextextended('doji-employee-sql-login-v1',0)) then raise exception 'Concurrent release';end if;
 if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Shared contract drift';end if;
 if exists(select 1 from public.daily_events where fires_at<=clock_timestamp()+interval '2 minutes' and fires_at+interval '12 minutes'>clock_timestamp() limit 1) then raise exception 'Event window: defer';end if;
 end$$;
 create role ${login} login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls connection limit 2 password '${verifier}';
 grant connect on database postgres to ${login};
 grant doji_employee_application,doji_employee_session to ${login} with inherit false, set true;
 alter role ${login} set statement_timeout='3s';
 alter role ${login} set lock_timeout='1s';
 alter role ${login} set idle_in_transaction_session_timeout='4s';
 ${guards}
 do $$begin if (${fingerprint})<>'${before.fingerprint}' then raise exception 'Shared contract changed';end if;end$$;
 commit;`;
 await writeFile(`${secretRoot}/install-login.sql`,sql,{flag:'wx'});
 await writeFile(`${secretRoot}/rehearse-login.sql`,sql.replace(/commit;$/,'rollback;'),{flag:'wx'});
 const rollback=`begin;set local lock_timeout='2s';set local statement_timeout='5s';
 alter role ${login} nologin;
 revoke doji_employee_application,doji_employee_session from ${login};
 commit;`;
 await writeFile(`${root}/rollback.sql`,rollback,{flag:'wx'});
 await save('candidate',{at:new Date().toISOString(),before,sqlHash:hash(sql),role:login,memberships:roles,connectionLimit:2,portalCutover:false});
 console.log('Prepared restricted employee transport and rollback; credential is protected and not displayed.');
} else {
 const candidate=await read('candidate');
 const sql=await readFile(`${secretRoot}/install-login.sql`,'utf8');
 assert.equal(hash(sql),candidate.sqlHash);
 if(mode==='rehearse'||mode==='apply') {
  assert.deepEqual(state(),candidate.before);
  if(mode==='apply') {
   assert.equal((await read('rehearsed')).sqlHash,candidate.sqlHash);
   await assert.rejects(access(`${root}/apply-started.json`),'Prior attempt: inspect, never retry');
   await save('apply-started',{at:new Date().toISOString(),sqlHash:candidate.sqlHash});
  }
  cli(['db','query','--file',`${secretRoot}/${mode==='apply'?'install':'rehearse'}-login.sql`,'--linked','--output-format','json']);
  if(mode==='rehearse') {
   assert.deepEqual(state(),candidate.before);
   await save('rehearsed',{at:new Date().toISOString(),sqlHash:candidate.sqlHash});
   console.log('Role/grant rehearsal passed and rolled back; existing contracts unchanged.');
   process.exit(0);
  }
 }
 const after=state();
 assert.equal(after.login_exists,true);assert.equal(after.fingerprint,evidenceAt(candidate,'before').fingerprint);
 query(`begin read only;set local statement_timeout='5s';${guards}rollback;`);
 const config:RestrictedSqlConfig=JSON.parse(await readFile(credentialPath,'utf8'));
 const execute=createRestrictedSql(config,options=>new pg.Client(options));
 // Exact disabled calls qualify real TLS, pooler, session_user and SET LOCAL
 // ROLE without writing a session, issuing a token or reading member content.
 const failures=[];
 for(const [role,statement,params] of [
  [roles[1],'select employee_session_private.execute_store($1,$2,$3,$4,$5,$6::integer,$7,$8) as result',['a'.repeat(64),'peek','flow','b'.repeat(64),null,null,null,null]],
  [roles[0],'select portal_identity_private.employee_rpc_v1($1,$2,$3,$4,$5,$6,$7::jsonb) as result',['https://invalid.test','invalid','user_probe','session_probe',true,'get_admin_portal_session_v3','{}']],
 ] satisfies [string,string,SqlParameter[]][]) {
  let code;
  try {await execute(role,statement,params,AbortSignal.timeout(6000));}
  catch(error) {code=error instanceof Error&&'code'in error?error.code:undefined;}
  failures.push({role,denied:code==='42501'});
  assert.equal(code,'42501','Hosted transport must reach the deliberately disabled authorization gate');
 }
 await save('verified-'+Date.now(),{at:new Date().toISOString(),after,checks:failures,tlsVerified:true,sharedContractUnchanged:true,portalCutover:false});
 console.log('Hosted employee pooler/TLS and both restricted roles verified. Login gates remain disabled; shared contracts unchanged.');
}
