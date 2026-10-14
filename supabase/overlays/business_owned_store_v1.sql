-- LOCAL PREPARATION. Additive bridge; no existing grant or function replacement.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create function business_session_private.execute_owned_store_v1(
 p_scope text,p_op text,p_kind text,p_key text,p_value text default null,
 p_ttl_ms integer default null,p_lease text default null,p_expected text default null
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
begin
 if p_kind='session' and p_op='put' then
  raise exception using errcode='42501',message='Guarded session installation required';
 end if;
 return business_session_private.execute_store(p_scope,p_op,p_kind,p_key,p_value,p_ttl_ms,p_lease,p_expected);
end$$;
revoke all on function business_session_private.execute_owned_store_v1(text,text,text,text,text,integer,text,text)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_enrollment;
grant execute on function business_session_private.execute_owned_store_v1(text,text,text,text,text,integer,text,text)
 to doji_business_session;
commit;
