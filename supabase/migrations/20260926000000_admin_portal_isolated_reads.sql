-- Additive portal-only reads. No table, trigger, RLS, member RPC, or grant on
-- an existing function is changed. Deploy before the gateway/static portal.
begin;

create function public.get_admin_portal_session_v3()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare base jsonb;
begin
  base := public.get_admin_portal_session_v2();
  return base || jsonb_build_object('capabilities', coalesce(base->'capabilities', '{}'::jsonb) || jsonb_build_object(
    'operations_read', public.admin_user_has_permission('operations.read'),
    'legal_read', public.admin_user_has_permission('legal.read'),
    'business_read', public.admin_user_has_permission('business.read')));
end;
$$;

create function public.get_admin_operational_health_read_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then raise exception 'Administrator MFA required'; end if;
  if not public.admin_user_has_permission('operations.read') then raise exception 'Administrator access required'; end if;
  -- The scheduler owns snapshot persistence. A portal GET never calls its Edge endpoint.
  return public.get_operational_health();
end;
$$;

create function public.get_admin_work_queue_page_v1(
  p_limit integer default 25, p_queue text default 'all', p_filter text default 'all',
  p_search text default null, p_after_at timestamptz default null,
  p_after_id text default null
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  result jsonb;
  can_moderate boolean;
  can_operate boolean;
begin
  if coalesce(auth.jwt()->>'aal', '') <> 'aal2' then raise exception 'Administrator MFA required'; end if;
  if not public.admin_user_has_permission('portal.session') then raise exception 'Administrator access required'; end if;
  if p_limit is null or p_limit not between 1 and 50 or p_queue is null or p_queue not in ('all','moderation','safety','suggestions')
    or p_filter is null or p_filter not in ('all','open','urgent','unassigned','mine','appeal')
    or length(coalesce(p_search,'')) > 160
    or (p_after_at is null) <> (p_after_id is null)
    or (p_after_id is not null and p_after_id !~ '^(report|appeal|suggestion):[0-9a-f-]{36}$') then
    raise exception 'Invalid work queue parameters';
  end if;
  can_moderate := public.admin_user_has_permission('moderation.read');
  can_operate := public.admin_user_has_permission('operations.read');
  -- Same evidence/decision permissions as the existing case RPCs. A legal-only
  -- or business-only operator can sign in but is not silently granted moderation.
  with work as (
    select r.created_at as sort_at, 'report:' || r.id as sort_id,
      t.assigned_to,
      jsonb_build_object(
        'id', r.id, 'queue', case when t.queue = 'restricted_safety' then 'safety' else 'moderation' end,
        'subject', initcap(replace(coalesce(r.target_kind,'content'),'_',' ')) || ' report',
        'secondary', initcap(replace(coalesce(nullif(r.reason_detail,''),r.reason),'_',' ')),
        'category', case r.reason
          when 'bullying_harassment' then 'Bullying or unwanted contact'
          when 'self_harm' then 'Suicide, self-harm or eating disorders'
          when 'violence_hate_exploitation' then 'Violence, hate or exploitation'
          when 'restricted_goods' then 'Selling or promoting restricted items'
          when 'sexual_content' then 'Nudity or sexual activity'
          when 'spam_scam' then 'Scam, fraud or spam'
          when 'intellectual_property' then 'Intellectual property'
          when 'privacy' then 'Privacy violation' when 'impersonation' then 'Impersonation' else 'Other concern' end,
        'submitted_at',r.created_at,'deadline_at',r.created_at + interval '24 hours',
        'status',case when t.queue = 'restricted_safety' then 'urgent' else 'open' end,
        'label',case when t.queue = 'restricted_safety' then 'Restricted' else 'Pending' end,
        'priority',coalesce(t.priority,case when r.created_at <= now()-interval '20 hours' then 'high' else 'normal' end),
        'summary','Explicit in-app report awaiting review.',
        'visibility',case when t.queue = 'restricted_safety' then 'Restricted evidence' else 'Authorized evidence available' end,
        'owner',coalesce(nullif(owner.display_name,''),nullif(owner.username,''),'Unassigned'),
        'assigned_to',t.assigned_to,'source','In-app report',
        'next_step','Review the authorized evidence and record an audited policy decision.',
        'target_kind',r.target_kind,'reason',r.reason,'reason_detail',r.reason_detail) as item
    from public.reports r
    left join public.admin_report_triage t on t.report_id=r.id
    left join public.profiles owner on owner.id=t.assigned_to
    where can_moderate and r.status='pending'
    union all
    select s.created_at, 'suggestion:' || s.id, null::uuid,
      jsonb_build_object('id',s.id,'queue','suggestions','subject',left(s.body,240),
        'secondary',initcap(replace(s.kind,'_',' ')),'category',initcap(replace(s.kind,'_',' ')),
        'submitted_at',s.created_at,'status','open','label','Pending','priority','normal',
        'summary',s.body,'visibility','Not published','owner','Unassigned','source','Community suggestion',
        'next_step','Review originality, safety, clarity, and participation potential.',
        'options',coalesce(s.options,'[]'::jsonb),
        'submitted_by',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name))
    from public.challenge_suggestions s left join public.profiles p on p.id=s.user_id
    where can_operate and s.status='pending'
    union all
    select a.submitted_at, 'appeal:' || a.id, null::uuid,
      jsonb_build_object('id',a.id,'queue','safety','status','appeal','label','Appeal',
        'subject',coalesce(p.display_name,p.username,'Member') || ' appealed a moderation decision',
        'secondary',replace(d.policy_code,'_',' '),'category','Appeal','owner','Unassigned',
        'priority',case when d.severity='level_3' then 'critical' else 'high' end,
        'appeal',jsonb_build_object('id',a.id,'decision_id',a.decision_id,'report_id',d.report_id,
          'status',a.status,'statement',a.statement,'submitted_at',a.submitted_at,
          'policy_code',d.policy_code,'severity',d.severity,'content_kind',d.content_kind,
          'original_decider_id',d.decided_by,
          'user',jsonb_build_object('id',p.id,'username',p.username,'display_name',p.display_name)))
    from public.moderation_appeals a join public.moderation_decisions d on d.id=a.decision_id
    join public.profiles p on p.id=a.user_id
    where can_moderate and a.status='pending'
  ), filtered as (
    select * from work where (p_queue='all' or item->>'queue'=p_queue)
      and (p_filter='all' or (p_filter='urgent' and item->>'priority' in ('critical','high'))
        or (p_filter='unassigned' and assigned_to is null)
        or (p_filter='mine' and assigned_to=auth.uid())
        or (p_filter in ('open','appeal') and item->>'status'=p_filter))
      and (nullif(btrim(p_search),'') is null or position(lower(btrim(p_search)) in lower(
        concat_ws(' ',item->>'id',item->>'subject',item->>'secondary',item->>'category',item->>'owner',item->>'label'))) > 0)
      and (p_after_at is null or (sort_at,sort_id) > (p_after_at,p_after_id))
    order by sort_at,sort_id limit p_limit+1
  ), page as (select * from filtered order by sort_at,sort_id limit p_limit)
  select jsonb_build_object('items',coalesce((select jsonb_agg(item order by sort_at,sort_id) from page),'[]'::jsonb),
    'order','oldest_first','next_cursor',case when (select count(*) from filtered)>p_limit then
      (select jsonb_build_object('at',sort_at,'id',sort_id) from page order by sort_at desc,sort_id desc limit 1) else null end)
  into result;
  return result;
end;
$$;

revoke all on function public.get_admin_portal_session_v3() from public, anon;
revoke all on function public.get_admin_operational_health_read_v1() from public, anon;
revoke all on function public.get_admin_work_queue_page_v1(integer,text,text,text,timestamptz,text) from public, anon;
grant execute on function public.get_admin_portal_session_v3() to authenticated;
grant execute on function public.get_admin_operational_health_read_v1() to authenticated;
grant execute on function public.get_admin_work_queue_page_v1(integer,text,text,text,timestamptz,text) to authenticated;
commit;
