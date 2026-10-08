-- LOCAL ONLY; requires staff_case_ownership_v1 and the independent employee bridge.
-- Does not replace the deployed dispatcher, source commands, roles or member RPCs.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create function staff_workflow_private.assignees(p_kind text,p_id uuid,p_after_id uuid,p_limit integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare source jsonb; result jsonb;
begin
 perform staff_workflow_private.authorize(p_kind);
 if not public.admin_user_has_permission('admin.manage') then
  raise exception using errcode='42501',message='Assignment management permission required';end if;
 source:=staff_workflow_private.source(p_kind,p_id);
 if not (source->>'actionable')::boolean then
  raise exception using errcode='PT409',message='Work item is no longer actionable';end if;
 if p_limit is null or p_limit not between 1 and 50 then
  raise exception using errcode='22023',message='Invalid assignee page';end if;
 with bounded as (
  select e.id,coalesce(nullif(e.display_name,''),'Employee') label
  from public.admin_employees e
  where e.status='active' and (p_after_id is null or e.id>p_after_id)
   and staff_workflow_private.eligible(p_kind,p_id,e.id)
  order by e.id limit p_limit+1
 ), page as (select * from bounded order by id limit p_limit)
 select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(p) order by id) from page p),'[]'),
  'next_cursor',case when (select count(*) from bounded)>p_limit then
   (select id from page order by id desc limit 1) else null end) into result;
 return result;
end$$;
revoke all on function staff_workflow_private.assignees(text,uuid,uuid,integer)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_employee_application;

create function portal_identity_private.employee_workflow_rpc_v1(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,p_name text,p_args jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; fields text[]; result jsonb;
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>16000 then
  raise exception using errcode='22023',message='Invalid employee request';end if;
 fields:=case p_name
  when 'get_admin_case_ownership_v1' then array['p_kind','p_id']
  when 'admin_case_ownership_command_v1' then array['p_kind','p_id','p_revision','p_source_version','p_action','p_target','p_request_id']
  when 'get_admin_owned_work_page_v1' then array['p_kind','p_filter','p_limit','p_after_at','p_after_key']
  when 'get_admin_staff_work_page_v1' then array['p_kind','p_filter','p_state','p_limit','p_after_at','p_after_key']
  when 'get_admin_staff_event_channels_v1' then array[]::text[]
  when 'get_admin_case_assignees_v1' then array['p_kind','p_id','p_after_id','p_limit']
  else null end;
 if fields is null then raise exception using errcode='42501',message='Employee operation not allowed';end if;
 if (select count(*) from jsonb_object_keys(p_args))<>cardinality(fields) or not p_args ?& fields then
  raise exception using errcode='22023',message='Invalid employee arguments';end if;
 -- No dynamic SQL or browser-selected claims, principal, schema or role.
 uid:=portal_identity_private.employee_actor_v1(p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform 1 from staff_workflow_private.settings where singleton and enabled for share;
 if not found then raise exception using errcode='55000',message='Staff workflow is not enabled';end if;
 perform set_config('request.jwt.claim','',true);
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','',true);
 perform set_config('request.jwt.claim.email','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','doji_employee','aal','aal2')::text,true);
 if not public.admin_user_has_permission('portal.session') then
  raise exception using errcode='42501',message='Portal permission required';end if;
 case p_name
  when 'get_admin_case_ownership_v1' then
   result:=public.get_admin_case_ownership_v1(p_args->>'p_kind',(p_args->>'p_id')::uuid);
  when 'admin_case_ownership_command_v1' then
   result:=public.admin_case_ownership_command_v1(p_args->>'p_kind',(p_args->>'p_id')::uuid,
    (p_args->>'p_revision')::bigint,p_args->>'p_source_version',p_args->>'p_action',
    (p_args->>'p_target')::uuid,(p_args->>'p_request_id')::uuid);
  when 'get_admin_owned_work_page_v1' then
   result:=public.get_admin_owned_work_page_v1(p_args->>'p_kind',p_args->>'p_filter',
    (p_args->>'p_limit')::integer,(p_args->>'p_after_at')::timestamptz,p_args->>'p_after_key');
  when 'get_admin_case_assignees_v1' then
   result:=staff_workflow_private.assignees(p_args->>'p_kind',(p_args->>'p_id')::uuid,
    (p_args->>'p_after_id')::uuid,(p_args->>'p_limit')::integer);
  when 'get_admin_staff_work_page_v1' then
   result:=public.get_admin_staff_work_page_v1(p_args->>'p_kind',p_args->>'p_filter',p_args->>'p_state',
    (p_args->>'p_limit')::integer,(p_args->>'p_after_at')::timestamptz,p_args->>'p_after_key');
  when 'get_admin_staff_event_channels_v1' then
   result:=public.get_admin_staff_event_channels_v1();
 end case;
 perform set_config('request.jwt.claims',prior_claims,true);
 perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);
 perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);
 return result;
exception when others then
 perform set_config('request.jwt.claims',prior_claims,true);
 perform set_config('request.jwt.claim',prior_claim,true);
 perform set_config('request.jwt.claim.sub',prior_sub,true);
 perform set_config('request.jwt.claim.role',prior_role,true);
 perform set_config('request.jwt.claim.email',prior_email,true);
 raise;
end$$;
revoke all on function portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_employee_application;
grant execute on function portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)
 to doji_employee_application;
-- staff_workflow_private.settings remains disabled. No setting enabled here.
commit;
