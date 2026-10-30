-- Additive employee read bridge. Requires workflow_health_v1; no member grants or writes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create function public.get_admin_workflow_health_v1() returns jsonb
language plpgsql stable security definer set search_path='' as $$begin
 if coalesce(auth.jwt()->>'role','')<>'doji_employee' or coalesce(auth.jwt()->>'aal','')<>'aal2'
  or auth.uid() is null or not public.admin_user_has_permission('operations.read') then
  raise exception using errcode='42501',message='Employee operations access required';end if;
 return public.get_workflow_health_v1();
end$$;
revoke all on function public.get_admin_workflow_health_v1() from public,anon,authenticated,service_role,doji_business,doji_employee_application;
grant execute on function public.get_admin_workflow_health_v1() to doji_employee;

create function portal_identity_private.employee_workflow_health_rpc_v1(p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,p_name text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; result jsonb;
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 if p_name is distinct from 'get_admin_workflow_health_v1' or p_args is distinct from '{}'::jsonb then
  raise exception using errcode='22023',message='Invalid employee health operation';end if;
 uid:=portal_identity_private.employee_actor_v1(p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform set_config('request.jwt.claim','',true);perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','',true);perform set_config('request.jwt.claim.email','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','doji_employee','aal','aal2')::text,true);
 result:=public.get_admin_workflow_health_v1();
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);return result;
exception when others then
 perform set_config('request.jwt.claims',prior_claims,true);perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);raise;
end$$;
revoke all on function portal_identity_private.employee_workflow_health_rpc_v1(text,text,text,text,boolean,text,jsonb)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver;
grant execute on function portal_identity_private.employee_workflow_health_rpc_v1(text,text,text,text,boolean,text,jsonb) to doji_employee_application;
commit;
