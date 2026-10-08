// Exact business transport privileges, no member/employee role or table access.
export const login = 'doji_business_portal_login';
export const roles = [
  'doji_business_session',
  'doji_business_registration',
  'doji_business_enrollment',
  'doji_identity_resolver',
] as const;
export const guards = `do $$declare r text;begin
 if not exists(select 1 from pg_roles where rolname='${login}' and rolcanlogin
  and not (rolsuper or rolinherit or rolcreatedb or rolcreaterole or rolreplication or rolbypassrls)
  and rolconnlimit=2) then raise exception 'Unsafe transport attributes';end if;
 if (select count(*) from pg_auth_members where member='${login}'::regrole)<>4
  or exists(select 1 from pg_auth_members where member='${login}'::regrole
   and (roleid not in(${roles.map((r) => `'${r}'::regrole`).join(',')})
    or admin_option or inherit_option or not set_option)) then raise exception 'Unsafe transport membership';end if;
 foreach r in array array['${login}',${roles.map((r) => `'${r}'`).join(',')}] loop
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in('public','auth','storage','business_private','portal_identity_private','employee_session_private','business_session_private')
   and c.relkind in('r','p','v','m') and has_table_privilege(r,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
   then raise exception 'Unexpected direct table access';end if;
  if pg_has_role(r,'authenticated','MEMBER') or pg_has_role(r,'service_role','MEMBER')
   or pg_has_role(r,'doji_business','MEMBER') or pg_has_role(r,'doji_employee','MEMBER')
   or pg_has_role(r,'doji_employee_application','MEMBER') or pg_has_role(r,'doji_employee_session','MEMBER')
   then raise exception 'Cross-boundary membership';end if;
  if has_function_privilege(r,'portal_identity_private.bind_identity(text,text,uuid,text)','EXECUTE')
   or has_function_privilege(r,'portal_identity_private.employee_rpc_v1(text,text,text,text,boolean,text,jsonb)','EXECUTE')
   or has_function_privilege(r,'employee_session_private.execute_store(text,text,text,text,text,integer,text,text)','EXECUTE')
   then raise exception 'Identity provisioning or employee authority reachable';end if;
 end loop;
 if pg_has_role('authenticator','${login}','MEMBER') or pg_has_role('authenticated','${login}','MEMBER')
  or pg_has_role('service_role','${login}','MEMBER') then raise exception 'API can assume business transport';end if;
 if (select enabled from business_session_private.settings where singleton)
  or (select registration_enabled from business_session_private.settings where singleton)
  or (select enabled from portal_identity_private.business_read_settings where singleton)
  or (select enabled from portal_identity_private.business_command_settings where singleton)
  or (select enabled from portal_identity_private.business_enrollment_settings where singleton)
  or exists(select 1 from portal_identity_private.realms where realm='business')
  then raise exception 'Business must remain disabled';end if;
end$$;`;
