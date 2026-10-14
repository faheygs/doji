-- OWNER-APPROVED LOCAL PREPARATION ONLY. Never an automatic migration.
-- Requires the two-source foundation, business privacy and external intake.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter table staff_workflow_private.settings add column extended_enabled boolean not null default false;
alter table staff_workflow_private.settings add column events_enabled boolean not null default false;
alter table staff_workflow_private.ownership drop constraint ownership_kind_check;
alter table staff_workflow_private.ownership add constraint ownership_kind_check
 check(kind in ('suggestion','business_application','appeal','business_privacy'));

create function staff_workflow_private.extended_actor() returns void
language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or auth.jwt()->>'role' is distinct from 'doji_employee'
  or auth.jwt()->>'aal' is distinct from 'aal2' or not public.admin_user_has_permission('portal.session') then
  raise exception using errcode='42501',message='Employee MFA required';end if;
 if not exists(select 1 from staff_workflow_private.settings where singleton and enabled and extended_enabled) then
  raise exception using errcode='55000',message='Extended staff workflow disabled';end if;
end$$;

-- This mirrors current appeal read restrictions, without exposing statements,
-- member identities, original evidence or account-action details in the inbox.
create function staff_workflow_private.appeal_restricted(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.moderation_appeals a
  join public.moderation_account_actions x on x.decision_id=a.decision_id
  where a.id=p_id and x.action in ('temporary_restriction','permanent_ban'))
$$;
alter function staff_workflow_private.authorize(text) rename to authorize_base;
create function staff_workflow_private.authorize(p_kind text) returns void
language plpgsql security definer set search_path='' as $$begin
 if p_kind in ('suggestion','business_application') then
  perform staff_workflow_private.authorize_base(p_kind);return;end if;
 perform staff_workflow_private.extended_actor();
 if p_kind='appeal' then
  if not public.admin_user_has_permission('moderation.read') then
   raise exception using errcode='42501',message='Appeal access required';end if;
 elsif p_kind='business_privacy' then perform business_private.privacy_actor();
 else raise exception using errcode='22023',message='Unsupported ownership queue';end if;
end$$;

alter function staff_workflow_private.eligible(text,uuid,uuid) rename to eligible_base;
create function staff_workflow_private.eligible(p_kind text,p_id uuid,p_employee uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$declare roles text[]; decider uuid;begin
 if p_kind in ('suggestion','business_application') then
  return staff_workflow_private.eligible_base(p_kind,p_id,p_employee);end if;
 select e.roles into roles from public.admin_employees e where e.id=p_employee and e.status='active';
 if roles is null then return false;end if;
 if p_kind='business_privacy' then return 'super_admin'=any(roles);end if;
 if p_kind<>'appeal' then return false;end if;
 select d.decided_by into decider from public.moderation_appeals a
  join public.moderation_decisions d on d.id=a.decision_id where a.id=p_id;
 if decider is null then return false;end if;
 -- Preserve the existing super-admin override; assignment does not execute it.
 return 'super_admin'=any(roles) or (roles&&array['operations','moderator']
  and decider<>p_employee and (not staff_workflow_private.appeal_restricted(p_id)
   or roles&&array['operations','legal_reviewer']));
end$$;

alter function staff_workflow_private.source(text,uuid,boolean) rename to source_base;
create function staff_workflow_private.source(p_kind text,p_id uuid,p_lock boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb; account uuid;begin
 if p_kind in ('suggestion','business_application') then
  return staff_workflow_private.source_base(p_kind,p_id,p_lock);end if;
 perform staff_workflow_private.authorize(p_kind);
 if p_kind='appeal' then
  -- Existing decision command locks appeal before decision. Follow that order.
  if p_lock then
   perform 1 from public.moderation_appeals where id=p_id for update;
   perform 1 from public.moderation_decisions where id=(select decision_id from public.moderation_appeals where id=p_id) for update;
  end if;
  if staff_workflow_private.appeal_restricted(p_id) and not public.admin_user_has_permission('legal.read') then
   raise exception using errcode='42501',message='Restricted appeal access required';end if;
  select jsonb_build_object('state',a.status,'actionable',a.status='pending',
   'source_version',md5(jsonb_build_array(to_jsonb(a),d.state,d.decided_by,staff_workflow_private.appeal_restricted(a.id))::text),
   'can_decide',public.admin_user_has_permission('moderation.write') and staff_workflow_private.eligible(p_kind,p_id,auth.uid()))
  into result from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id where a.id=p_id;
 elsif p_kind='business_privacy' then
  if p_lock then
   select account_id into account from business_private.privacy_cases where id=p_id;
   perform 1 from business_private.accounts where id=account for update;
   perform 1 from business_private.privacy_cases where id=p_id for update;
  end if;
  select jsonb_build_object('state',state,'actionable',state not in ('completed','denied'),
   'source_version',revision::text,'can_decide',state<>'executing') into result
  from business_private.privacy_cases where id=p_id;
 end if;
 if result is null then raise exception using errcode='P0002',message='Work item unavailable';end if;
 return result;
end$$;

-- Minimal shared shape. Each source is authorized and bounded before union.
-- Owner fields for report/intake are read from their existing stores, not copied.
create function public.get_admin_staff_work_page_v1(
 p_kind text default 'all',p_filter text default 'all',p_state text default 'all',p_limit integer default 25,
 p_after_at timestamptz default null,p_after_key text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; mod boolean; legal boolean; ideas boolean; business boolean; privacy boolean;begin
 perform staff_workflow_private.extended_actor();
 if p_kind is null or p_kind not in ('all','report','appeal','suggestion','business_application','external_intake','business_privacy')
  or p_filter is null or p_filter not in ('all','mine','unassigned')
  or p_state is null or p_state not in ('all','ready','waiting') or p_limit is null or p_limit not between 1 and 50
  or (p_after_at is null)<>(p_after_key is null)
  or (p_after_key is not null and p_after_key !~ '^(report|appeal|suggestion|business_application|external_intake|business_privacy):[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$') then
  raise exception using errcode='22023',message='Invalid staff inbox parameters';end if;
 mod:=public.admin_user_has_permission('moderation.read');legal:=public.admin_user_has_permission('legal.read');
 ideas:=public.admin_user_has_permission('operations.read');
 business:=public.admin_user_has_permission('business.read') and exists(select 1 from business_private.settings where enabled and application_terms_version is not null and privacy_version is not null);
 privacy:=legal and public.admin_user_has_permission('admin.manage') and exists(select 1 from business_private.privacy_settings where enabled);
 with sources as (
  (select 'report'::text kind,r.id,r.created_at at,t.assigned_to,'Content report'::text subject,'ready'::text work_state,
    r.created_at+interval '24 hours' due_at,'existing_report'::text ownership_model
   from public.reports r left join public.admin_report_triage t on t.report_id=r.id
   where mod and p_kind in ('all','report') and r.status='pending' and (coalesce(t.queue,'moderation')<>'restricted_safety' or legal)
    and (p_state in ('all','ready')) and (p_filter='all' or (p_filter='mine' and t.assigned_to=auth.uid()) or (p_filter='unassigned' and t.assigned_to is null))
    and (p_after_at is null or (r.created_at,'report:'||r.id)>(p_after_at,p_after_key)) order by r.created_at,r.id limit p_limit+1)
  union all
  (select 'appeal',a.id,a.submitted_at,o.assigned_to,'Moderation appeal','ready',null::timestamptz,'staff_workflow'
   from public.moderation_appeals a left join staff_workflow_private.ownership o on o.kind='appeal' and o.case_id=a.id
   where mod and p_kind in ('all','appeal') and a.status='pending' and (legal or not staff_workflow_private.appeal_restricted(a.id))
    and p_state in ('all','ready') and (p_filter='all' or (p_filter='mine' and o.assigned_to=auth.uid()) or (p_filter='unassigned' and o.assigned_to is null))
    and (p_after_at is null or (a.submitted_at,'appeal:'||a.id)>(p_after_at,p_after_key)) order by a.submitted_at,a.id limit p_limit+1)
  union all
  (select 'suggestion',s.id,s.created_at,o.assigned_to,left(s.body,120),'ready',null::timestamptz,'staff_workflow'
   from public.challenge_suggestions s left join staff_workflow_private.ownership o on o.kind='suggestion' and o.case_id=s.id
   where ideas and p_kind in ('all','suggestion') and s.status='pending' and p_state in ('all','ready')
    and (p_filter='all' or (p_filter='mine' and o.assigned_to=auth.uid()) or (p_filter='unassigned' and o.assigned_to is null))
    and (p_after_at is null or (s.created_at,'suggestion:'||s.id)>(p_after_at,p_after_key)) order by s.created_at,s.id limit p_limit+1)
  union all
  (select 'business_application',a.id,a.created_at,o.assigned_to,coalesce(nullif(left(s.details->>'brand_name',120),''),'Business application'),
    case when a.state='changes_requested' then 'waiting' else 'ready' end,null::timestamptz,'staff_workflow'
   from business_private.applications a left join staff_workflow_private.ownership o on o.kind='business_application' and o.case_id=a.id
   left join business_private.submissions s on s.application_id=a.id and s.submission=a.submission
   where business and p_kind in ('all','business_application') and a.state in ('pending','changes_requested')
    and (p_state='all' or p_state=case when a.state='changes_requested' then 'waiting' else 'ready' end)
    and (p_filter='all' or (p_filter='mine' and o.assigned_to=auth.uid()) or (p_filter='unassigned' and o.assigned_to is null))
    and (p_after_at is null or (a.created_at,'business_application:'||a.id)>(p_after_at,p_after_key)) order by a.created_at,a.id limit p_limit+1)
  union all
  (select 'external_intake',c.id,c.received_at,c.assigned_to,'External removal request',
    case when c.state='needs_information' then 'waiting' else 'ready' end,c.deadline_at,'existing_intake'
   from public.safety_removal_cases c where mod and p_kind in ('all','external_intake') and c.closed_at is null
    and (c.queue='moderation' or legal)
    and (p_state='all' or p_state=case when c.state='needs_information' then 'waiting' else 'ready' end)
    and (p_filter='all' or (p_filter='mine' and c.assigned_to=auth.uid()) or (p_filter='unassigned' and c.assigned_to is null))
    and (p_after_at is null or (c.received_at,'external_intake:'||c.id)>(p_after_at,p_after_key)) order by c.received_at,c.id limit p_limit+1)
  union all
  (select 'business_privacy',c.id,c.received_at,o.assigned_to,'Business privacy request',
    case when c.state='executing' then 'waiting' else 'ready' end,c.due_at,'staff_workflow'
   from business_private.privacy_cases c left join staff_workflow_private.ownership o on o.kind='business_privacy' and o.case_id=c.id
   where privacy and p_kind in ('all','business_privacy') and c.state not in ('completed','denied')
    and (p_state='all' or p_state=case when c.state='executing' then 'waiting' else 'ready' end)
    and (p_filter='all' or (p_filter='mine' and o.assigned_to=auth.uid()) or (p_filter='unassigned' and o.assigned_to is null))
    and (p_after_at is null or (c.received_at,'business_privacy:'||c.id)>(p_after_at,p_after_key)) order by c.received_at,c.id limit p_limit+1)
 ), bounded as (select *,kind||':'||id key from sources order by at,kind||':'||id limit p_limit+1),
 page as (select * from bounded order by at,key limit p_limit)
 select jsonb_build_object('scope','staff_inbox_v1','order','oldest_first',
  'items',coalesce((select jsonb_agg(to_jsonb(p) order by at,key) from page p),'[]'),
  'next_cursor',case when (select count(*) from bounded)>p_limit then (select jsonb_build_object('at',at,'key',key) from page order by at desc,key desc limit 1) else null end,
  'authorized_queues',to_jsonb(array_remove(array[case when mod then 'report' end,case when mod then 'appeal' end,
    case when mod then 'external_intake' end,case when ideas then 'suggestion' end,
    case when business then 'business_application' end,case when privacy then 'business_privacy' end],null))) into result;
 return result;
end$$;

revoke all on all functions in schema staff_workflow_private from public,anon,authenticated,doji_employee,doji_business,service_role;
revoke all on function public.get_admin_staff_work_page_v1(text,text,text,integer,timestamptz,text) from public,anon,authenticated,service_role,doji_business,doji_employee_application;
grant execute on function public.get_admin_staff_work_page_v1(text,text,text,integer,timestamptz,text) to doji_employee;
commit;
