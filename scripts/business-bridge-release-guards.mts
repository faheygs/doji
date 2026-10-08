// Fixed SQL boundaries for the separately approved independent-business bridge.
export const modified = [
  'public.business_application_command_v1(text,bigint,jsonb,text,text,uuid)',
  'public.admin_business_application_command_v1(uuid,bigint,text,text,text,uuid)',
  'business_private.privacy_target(uuid,boolean)',
  'public.get_admin_business_privacy_access_v1(uuid,bigint)',
  'public.claim_business_erasure_v1(uuid,uuid)',
  'public.finish_business_erasure_v1(uuid,uuid)',
];
const allowlist = modified.map((x) => `'${x}'::regprocedure`).join(',');
export const fingerprint = `select md5(jsonb_build_object(
 'functions',(select jsonb_agg(jsonb_build_array(p.oid,pg_get_functiondef(p.oid),p.proacl::text) order by p.oid)
  from pg_proc p where p.prokind='f' and p.pronamespace in('public'::regnamespace,'auth'::regnamespace,
  'storage'::regnamespace,'business_private'::regnamespace,'portal_identity_private'::regnamespace,'business_session_private'::regnamespace)),
 'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p
  where schemaname in('public','auth','storage','business_private','portal_identity_private','business_session_private')),
 'relations',(select jsonb_agg(jsonb_build_array(c.oid,c.relacl::text,c.relrowsecurity,c.relforcerowsecurity) order by c.oid)
  from pg_class c where c.relkind in('r','p','v','m') and c.relnamespace in('public'::regnamespace,'auth'::regnamespace,
  'storage'::regnamespace,'business_private'::regnamespace,'portal_identity_private'::regnamespace,'business_session_private'::regnamespace)),
 'employee_realm',(select to_jsonb(r) from portal_identity_private.realms r where realm='employee'),
 'employee_settings',(select to_jsonb(s) from employee_session_private.settings s where singleton),
 'business_settings',(select to_jsonb(s) from business_private.settings s where singleton)
 )::text)`;
export const windowGuard = `if exists(select 1 from public.daily_events
 where fires_at<=clock_timestamp()+interval '25 minutes' and fires_at+interval '15 minutes'>clock_timestamp() limit 1)
 then raise exception 'Event window: defer';end if;`;
export const beforeTables = `
create temp table release_functions as select oid,pg_get_functiondef(oid) definition,proacl
 from pg_proc where prokind='f' and pronamespace in('public'::regnamespace,'auth'::regnamespace,
 'storage'::regnamespace,'business_private'::regnamespace,'portal_identity_private'::regnamespace,'business_session_private'::regnamespace);
create temp table release_relations as select oid,relacl,relrowsecurity,relforcerowsecurity from pg_class
 where relkind in('r','p','v','m') and relnamespace in('public'::regnamespace,'auth'::regnamespace,
 'storage'::regnamespace,'business_private'::regnamespace,'portal_identity_private'::regnamespace,'business_session_private'::regnamespace);
create temp table release_policies as select * from pg_policies;
create temp table release_settings as select 'employee_realm' k,to_jsonb(r) v from portal_identity_private.realms r where realm='employee'
 union all select 'employee_session',to_jsonb(s) from employee_session_private.settings s
 union all select 'employee_rpc',to_jsonb(s) from portal_identity_private.employee_rpc_settings s
 union all select 'business',to_jsonb(s) from business_private.settings s;`;
export const afterGuards = `do $$begin
 if exists(select 1 from release_functions f left join pg_proc p on p.oid=f.oid where p.oid is null
  or f.proacl is distinct from p.proacl or (p.oid not in(${allowlist}) and f.definition is distinct from pg_get_functiondef(p.oid)))
 then raise exception 'Unrelated function or existing ACL changed';end if;
 if exists(select 1 from release_relations b left join pg_class c on c.oid=b.oid where c.oid is null
  or (b.relacl,b.relrowsecurity,b.relforcerowsecurity) is distinct from (c.relacl,c.relrowsecurity,c.relforcerowsecurity))
 then raise exception 'Existing relation privileges changed';end if;
 if exists(select * from release_policies except select * from pg_policies)
  or exists(select * from pg_policies except select * from release_policies) then raise exception 'RLS policies changed';end if;
 if exists(select * from release_settings except select * from (
  select 'employee_realm' k,to_jsonb(r) v from portal_identity_private.realms r where realm='employee'
  union all select 'employee_session',to_jsonb(s) from employee_session_private.settings s
  union all select 'employee_rpc',to_jsonb(s) from portal_identity_private.employee_rpc_settings s
  union all select 'business',to_jsonb(s) from business_private.settings s) n)
 then raise exception 'Existing settings changed';end if;
 if exists(select 1 from portal_identity_private.realms where realm='business')
  or exists(select 1 from portal_identity_private.principals where realm='business')
  or exists(select 1 from business_private.accounts) then raise exception 'Business identity state changed';end if;
 if (select enabled from portal_identity_private.business_read_settings where singleton)
  or (select enabled from portal_identity_private.business_command_settings where singleton)
  or (select enabled from portal_identity_private.business_enrollment_settings where singleton)
  or (select enabled or registration_enabled from business_session_private.settings where singleton)
 then raise exception 'Business gates must remain disabled';end if;
 if exists(select 1 from pg_roles where rolname in('doji_business_enrollment','doji_business_registration')
  and (rolcanlogin or rolinherit or rolsuper or rolcreatedb or rolcreaterole or rolbypassrls or rolreplication))
 then raise exception 'Unsafe business role';end if;
end$$;`;
export const restoredGuards = `do $$begin
 if exists(select 1 from release_functions f left join pg_proc p on p.oid=f.oid where p.oid is null
  or f.proacl is distinct from p.proacl or f.definition is distinct from pg_get_functiondef(p.oid))
 then raise exception 'Rollback did not restore exact existing functions/ACLs';end if;
end$$;`;
