-- OWNER-APPROVED LOCAL PREPARATION. Default-off reads; no existing dispatcher changed.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create function portal_identity_private.employee_history_rpc_v1(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,p_name text,p_args jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; fields text[]; result jsonb;
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 fields:=case p_name
  when 'get_admin_personal_work_page_v1' then array['p_kind','p_state','p_limit','p_after_at','p_after_key']
  when 'get_admin_announcement_lifecycle_page_v1' then array['p_filter','p_limit','p_before_at','p_before_id']
  else null end;
 if fields is null then raise exception using errcode='42501',message='History operation not allowed';end if;
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>4096
  or not p_args ?& fields or (select count(*) from jsonb_object_keys(p_args))<>cardinality(fields) then
  raise exception using errcode='22023',message='Invalid history arguments';end if;
 uid:=portal_identity_private.employee_actor_v1(p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform set_config('request.jwt.claim','',true);perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claim.email','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','doji_employee','aal','aal2')::text,true);
 if p_name='get_admin_personal_work_page_v1' then
  result:=public.get_admin_personal_work_page_v1(p_args->>'p_kind',p_args->>'p_state',
   (p_args->>'p_limit')::integer,(p_args->>'p_after_at')::timestamptz,p_args->>'p_after_key');
 else
  result:=public.get_admin_announcement_lifecycle_page_v1(p_args->>'p_filter',
   (p_args->>'p_limit')::integer,(p_args->>'p_before_at')::timestamptz,(p_args->>'p_before_id')::uuid);
 end if;
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);return result;
exception when others then
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);raise;
end$$;
revoke all on function portal_identity_private.employee_history_rpc_v1(text,text,text,text,boolean,text,jsonb)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_employee_application;
grant execute on function portal_identity_private.employee_history_rpc_v1(text,text,text,text,boolean,text,jsonb)
 to doji_employee_application;
commit;
