-- OWNER-APPROVED LOCAL PREPARATION ONLY. Deploy separately from portal assets.
-- Additive employee read: no domain writes, policies, indexes or event changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter table staff_workflow_private.settings add column safety_queue_enabled boolean not null default false;
create function public.get_admin_safety_work_page_v1(
 p_queue text,p_closed boolean default false,p_kind text default 'all',p_filter text default 'all',
 p_limit integer default 25,p_after_at timestamptz default null,p_after_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;begin
 perform staff_workflow_private.extended_actor();
 if not exists(select 1 from staff_workflow_private.settings where singleton and safety_queue_enabled) then
  raise exception using errcode='55000',message='Unified safety queue disabled';end if;
 if p_queue is null or p_queue not in ('moderation','restricted_safety') or p_closed is null
  or p_kind is null or p_kind not in ('all','report','appeal','external_intake')
  or p_filter is null or p_filter not in ('all','mine','unassigned')
  or p_limit is null or p_limit not between 1 and 25
  or (p_after_at is null)<>(p_after_key is null)
  or (p_after_key is not null and p_after_key !~ '^(report|appeal|external_intake):[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') then
  raise exception using errcode='22023',message='Invalid safety queue parameters';end if;
 if not public.admin_user_has_permission('moderation.read')
  or (p_queue='restricted_safety' and not public.admin_user_has_permission('legal.read')) then
  raise exception using errcode='42501',message='Safety queue access required';end if;
 -- Filter each source BEFORE bounding/merging. No client-side page filtering.
 with sources as (
  (select 'report'::text kind,r.id,r.created_at at,t.assigned_to,'Content report'::text subject,
    case when p_closed then 'closed' else 'ready' end work_state,
    case when not p_closed then r.created_at+interval '24 hours' end due_at,
    'existing_report'::text ownership_model,'in_app'::text origin,r.status::text status
   from public.reports r left join public.admin_report_triage t on t.report_id=r.id
   where p_kind in ('all','report') and (r.status<>'pending')=p_closed
    and coalesce(t.queue,'moderation')=p_queue
    and (p_filter='all' or (p_filter='mine' and t.assigned_to=auth.uid()) or (p_filter='unassigned' and t.assigned_to is null))
    and (p_after_at is null or (r.created_at,'report:'||r.id)>(p_after_at,p_after_key))
   order by r.created_at,r.id limit p_limit+1)
  union all
  (select 'appeal',a.id,a.submitted_at,o.assigned_to,'Moderation appeal',
    case when p_closed then 'closed' else 'ready' end,null::timestamptz,'staff_workflow','in_app',a.status::text
   from public.moderation_appeals a left join staff_workflow_private.ownership o on o.kind='appeal' and o.case_id=a.id
   where p_kind in ('all','appeal') and (a.status<>'pending')=p_closed
    and (case when staff_workflow_private.appeal_restricted(a.id) then 'restricted_safety' else 'moderation' end)=p_queue
    and (p_filter='all' or (p_filter='mine' and o.assigned_to=auth.uid()) or (p_filter='unassigned' and o.assigned_to is null))
    and (p_after_at is null or (a.submitted_at,'appeal:'||a.id)>(p_after_at,p_after_key))
   order by a.submitted_at,a.id limit p_limit+1)
  union all
  (select 'external_intake',c.id,c.received_at,c.assigned_to,'Removal request',
    case when p_closed then 'closed' when c.state='needs_information' then 'waiting' else 'ready' end,
    case when not p_closed then c.deadline_at end,'existing_intake','external',c.state
   from public.safety_removal_cases c
   where p_kind in ('all','external_intake') and (c.closed_at is not null)=p_closed and c.queue=p_queue
    and (p_filter='all' or (p_filter='mine' and c.assigned_to=auth.uid()) or (p_filter='unassigned' and c.assigned_to is null))
    and (p_after_at is null or (c.received_at,'external_intake:'||c.id)>(p_after_at,p_after_key))
   order by c.received_at,c.id limit p_limit+1)
 ), bounded as (select *,kind||':'||id key from sources order by at,kind||':'||id limit p_limit+1),
 page as (select * from bounded order by at,key limit p_limit)
 select jsonb_build_object('scope','staff_safety_v1','order','oldest_first','queue',p_queue,'closed',p_closed,
  'items',coalesce((select jsonb_agg(to_jsonb(p) order by at,key) from page p),'[]'),
  'next_cursor',case when (select count(*) from bounded)>p_limit then
   (select jsonb_build_object('at',at,'key',key) from page order by at desc,key desc limit 1) else null end,
  'authorized_queues',jsonb_build_array('report','appeal','external_intake')) into result;
 return result;
end$$;
revoke all on function public.get_admin_safety_work_page_v1(text,boolean,text,text,integer,timestamptz,text)
 from public,anon,authenticated,service_role,doji_business,doji_employee_application;
grant execute on function public.get_admin_safety_work_page_v1(text,boolean,text,text,integer,timestamptz,text) to doji_employee;

-- Retain the exact previous dispatcher for rollback and delegate all old routes.
alter function portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb)
 rename to employee_workflow_before_safety_v1;
revoke all on function portal_identity_private.employee_workflow_before_safety_v1(text,text,text,text,boolean,text,jsonb) from doji_employee_application;
create function portal_identity_private.employee_workflow_rpc_v1(
 p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean,p_name text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid; result jsonb;
 fields text[]:=array['p_queue','p_closed','p_kind','p_filter','p_limit','p_after_at','p_after_key'];
 prior_claims text:=coalesce(current_setting('request.jwt.claims',true),'');
 prior_claim text:=coalesce(current_setting('request.jwt.claim',true),'');
 prior_sub text:=coalesce(current_setting('request.jwt.claim.sub',true),'');
 prior_role text:=coalesce(current_setting('request.jwt.claim.role',true),'');
 prior_email text:=coalesce(current_setting('request.jwt.claim.email',true),'');
begin
 if p_name is distinct from 'get_admin_safety_work_page_v1' then
  return portal_identity_private.employee_workflow_before_safety_v1(p_issuer,p_audience,p_subject,p_session,p_mfa,p_name,p_args);end if;
 if p_args is null or jsonb_typeof(p_args)<>'object' or octet_length(p_args::text)>16000
  or (select count(*) from jsonb_object_keys(p_args))<>cardinality(fields) or not p_args ?& fields then
  raise exception using errcode='22023',message='Invalid employee arguments';end if;
 uid:=portal_identity_private.employee_actor_v1(p_issuer,p_audience,p_subject,p_session,p_mfa);
 perform set_config('request.jwt.claim','',true);
 perform set_config('request.jwt.claim.sub','',true);
 perform set_config('request.jwt.claim.role','',true);
 perform set_config('request.jwt.claim.email','',true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',uid,'role','doji_employee','aal','aal2')::text,true);
 result:=public.get_admin_safety_work_page_v1(p_args->>'p_queue',(p_args->>'p_closed')::boolean,p_args->>'p_kind',
  p_args->>'p_filter',(p_args->>'p_limit')::integer,(p_args->>'p_after_at')::timestamptz,p_args->>'p_after_key');
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
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;
grant execute on function portal_identity_private.employee_workflow_rpc_v1(text,text,text,text,boolean,text,jsonb) to doji_employee_application;
commit;
