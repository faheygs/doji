-- Local preparation only; separate shared-system deployment approval required.
-- Adds a fixed employee-only bridge, never expands the existing member dispatcher.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create function portal_identity_private.employee_announcement_rpc_v1(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,p_name text,p_args jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; result jsonb;
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 if p_name is distinct from 'admin_announcement_compose_v1' or p_args is null
   or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>16000
   or not p_args ?& array['p_action','p_id','p_version','p_input','p_request_id']
   or exists(select 1 from jsonb_object_keys(p_args) k
     where k not in ('p_action','p_id','p_version','p_input','p_request_id')) then
   raise exception using errcode='22023',message='Invalid announcement operation';
 end if;
 uid:=portal_identity_private.employee_actor_v1(p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform set_config('request.jwt.claim','',true);perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claim.email','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','doji_employee','aal','aal2')::text,true);
 result:=public.admin_announcement_compose_v1(p_args->>'p_action',(p_args->>'p_id')::uuid,
   p_args->>'p_version',p_args->'p_input',(p_args->>'p_request_id')::uuid);
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);return result;
exception when others then
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);raise;
end$$;
revoke all on function portal_identity_private.employee_announcement_rpc_v1(text,text,text,text,boolean,text,jsonb)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_employee_application;
grant execute on function portal_identity_private.employee_announcement_rpc_v1(text,text,text,text,boolean,text,jsonb)
 to doji_employee_application;
commit;
