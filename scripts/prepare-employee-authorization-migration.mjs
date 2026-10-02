// Capture bounded, read-only production contract fingerprints. Prepare a single
// transaction that refuses drift and preserves all member/anonymous contracts.
// Keep candidates outside supabase/migrations until all release gates pass.
import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const cli='C:/Users/gfahe/AppData/Local/npm-cache/_npx/b96a6bd565c470ce/node_modules/@supabase/cli-windows-x64/bin/supabase.exe';
const query=`select p.oid::regprocedure::text signature,md5(pg_get_functiondef(p.oid)) fingerprint
  from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`;
const result=JSON.parse(execFileSync(cli,['db','query','--linked','--output-format','json',query],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
assert.ok(result.rows.length>300);
writeFileSync('test-results/employee-access-release/production-function-baseline.json',JSON.stringify(result.rows,null,2));
const quote=s=>`'${s.replaceAll("'","''")}'`;
const signatures=result.rows.map(r=>`(${quote(r.signature)},${quote(r.fingerprint)})`).join(',\n');
const guard=`
set local statement_timeout='30s';
create temporary table employee_release_expected(signature text, fingerprint text) on commit drop;
insert into employee_release_expected values ${signatures};
do $$begin
 if exists(select 1 from employee_release_expected e where to_regprocedure(e.signature) is null
    or md5(pg_get_functiondef(to_regprocedure(e.signature)))<>e.fingerprint) then
   raise exception 'Employee release stopped: production function drift'; end if;
end$$;
create temporary table employee_release_member_functions on commit drop as
select p.oid,p.oid::regprocedure::text signature, md5(pg_get_functiondef(p.oid)) fingerprint,
 has_function_privilege('authenticated',p.oid,'EXECUTE') member_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') anon_execute
from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f';
create temporary table employee_release_member_tables on commit drop as
select c.oid,c.relrowsecurity,c.relforcerowsecurity,r.role,v.privilege,has_table_privilege(r.role,c.oid,v.privilege) allowed
from pg_class c join pg_namespace n on n.oid=c.relnamespace
cross join (values('authenticated'),('anon')) r(role)
cross join (values('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRIGGER')) v(privilege)
where n.nspname in ('public','storage') and c.relkind in ('r','p','v','m');
create temporary table employee_release_member_policies on commit drop as
select * from pg_policies where schemaname in ('public','storage');
`;
const after=`
do $$begin
 if exists(select 1 from employee_release_member_functions b
   where b.member_execute<>has_function_privilege('authenticated',to_regprocedure(b.signature),'EXECUTE')
      or b.anon_execute<>has_function_privilege('anon',to_regprocedure(b.signature),'EXECUTE')) then
   raise exception 'Employee release stopped: member RPC grant changed'; end if;
 if exists(select 1 from employee_release_member_functions b
   where b.fingerprint<>md5(pg_get_functiondef(to_regprocedure(b.signature)))
   and b.signature !~ '^(get_admin_|trg_enforce_write_rate_limit\\(\\)$|admin_user_has_permission\\(|admin_current_operator_role\\(|admin_decide_report_v2_legacy_20260924\\(|admin_decide_report_v3\\(|admin_review_moderation_appeal_before_account_restrictions_2026\\(|admin_set_report_review_state_v1\\(|admin_triage_report_before_restricted_guard_20260924\\()') then
   raise exception 'Employee release stopped: non-portal function changed'; end if;
 if exists(select 1 from employee_release_member_tables b join pg_class c on c.oid=b.oid
   where b.allowed<>has_table_privilege(b.role,b.oid,b.privilege)
     or b.relrowsecurity<>c.relrowsecurity or b.relforcerowsecurity<>c.relforcerowsecurity) then
   raise exception 'Employee release stopped: member table grant or RLS changed'; end if;
 if exists((select * from employee_release_member_policies except select * from pg_policies)
   union all (select * from pg_policies where schemaname in ('public','storage')
     and policyname not in ('employee_report_evidence_read','employee_report_evidence_boundary')
     except select * from employee_release_member_policies)) then
   raise exception 'Employee release stopped: existing policy changed'; end if;
end$$;
notify pgrst, 'reload schema';
`;
let source=readFileSync('docs/drafts/20260926011000_employee_portal_authorization.sql','utf8');
source=source.replace(/^-- DRAFT[^\r\n]*/, '-- Reviewed employee authorization and approved rate-limit dispatch. Promote only after release gates pass.');
source=source.replace("set local lock_timeout = '3s';",()=>`set local lock_timeout = '3s';\n${guard}`);
source=source.replace(/commit;\s*$/,()=>`${after}\ncommit;\n`);
writeFileSync('test-results/employee-access-release/proposed-authorization.sql',source);
console.log(`Prepared guarded migration against ${result.rows.length} live function fingerprints; no production write performed.`);
