-- LOCAL CANDIDATE ONLY. Owner-approved preparation, production separately gated.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table public.safety_removal_report_links (
 report_id uuid primary key references public.reports(id) deferrable initially deferred,
 case_id uuid not null unique references public.safety_removal_cases(id),
 actor_id uuid not null, target_kind text not null, target_id uuid not null, owner_id uuid not null
);
create table public.safety_removal_staff_budget (
 actor_id uuid primary key, window_at timestamptz not null, used integer not null
);
create table public.safety_removal_bridge_rollback (
 signature text primary key, original_definition text not null, installed_hash text not null
);
alter table public.safety_removal_report_links enable row level security;
alter table public.safety_removal_staff_budget enable row level security;
alter table public.safety_removal_bridge_rollback enable row level security;
revoke all on public.safety_removal_report_links,public.safety_removal_staff_budget,public.safety_removal_bridge_rollback
 from public,anon,authenticated,doji_employee,service_role;

-- Text-only exact lookup. No external URL fetch, media signing or broad search.
create function public.get_admin_safety_target_v1(p_case_id uuid,p_kind text,p_target_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare detail jsonb; owner_id uuid; result jsonb;
begin
 perform public.safety_removal_authorize_v1(false,p_case_id);
 if not exists(select 1 from public.safety_removal_cases where id=p_case_id and closed_at is null) then
  raise exception using errcode='22023',message='Open removal request required'; end if;
 if not exists(select 1 from public.safety_removal_cases c join public.safety_removal_taxonomy_v1() t
 on t.reason=c.request->>'reason' and t.detail=c.request->>'detail'
 where c.id=p_case_id and p_kind=any(t.targets)) then
 raise exception using errcode='22023',message='Content type does not match the reported category'; end if;
 if p_kind='post' then
  select jsonb_build_object('text',left(coalesce(p.caption,''),3000),'state',p.moderation_status,'created_at',p.created_at,
   'photo_ref',p.photo_url,'front_photo_ref',p.front_photo_url,'video_ref',p.video_url),p.user_id
   into detail,owner_id from public.posts p where id=p_target_id;
 elsif p_kind='comment' then
  select jsonb_build_object('text',left(p.body,3000),'state',p.moderation_status,'created_at',p.created_at,'post_id',p.post_id),p.user_id
   into detail,owner_id from public.comments p where id=p_target_id;
 elsif p_kind='poll_response' then
  select jsonb_build_object('text',left(coalesce(p.custom_text,''),3000),'state',p.moderation_status,'created_at',p.created_at,'daily_event_id',p.daily_event_id),p.user_id
   into detail,owner_id from public.poll_votes p where id=p_target_id;
 elsif p_kind='profile_photo' then
  select jsonb_build_object('text','Current profile photo','state','current','photo_ref',p.avatar_url),p.id
   into detail,owner_id from public.profiles p where id=p_target_id and avatar_url is not null;
 elsif p_kind='account' then
  select jsonb_build_object('text',p.username,'state','Account behavior review'),p.id
   into detail,owner_id from public.profiles p where id=p_target_id;
 else raise exception using errcode='22023',message='Choose an exact content type'; end if;
 if detail is null or owner_id is null then raise exception using errcode='P0002',message='Exact content unavailable; do not infer a substitute'; end if;
 result:=jsonb_build_object('case_id',p_case_id,'id',p_target_id,'kind',p_kind,'owner_id',owner_id,
  'username',(select username from public.profiles where id=owner_id),'detail',detail);
 insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,metadata)
 values(auth.uid(),public.admin_current_operator_role(),'safety.target_viewed','safety_removal',p_case_id::text,
  jsonb_build_object('targetKind',p_kind,'targetId',p_target_id));
 return result||jsonb_build_object('fingerprint',encode(extensions.digest(result::text,'sha256'),'hex'));
end$$;

-- Called only by the report INSERT trigger under the authenticated employee's
-- context. No direct table grant; reserved link must match every report field.
create function public.authorize_safety_report_insert_v1(p_report public.reports)
returns void language plpgsql security definer set search_path='' as $$
declare n integer; t timestamptz:=date_trunc('minute',clock_timestamp());
begin
 perform public.safety_removal_authorize_v1(true);
 if p_report.reporter_id is not null or p_report.status is distinct from 'pending'
  or not exists(select 1 from public.safety_removal_report_links l join public.safety_removal_cases c on c.id=l.case_id
   where l.report_id=p_report.id and l.actor_id=auth.uid() and c.closed_at is null
    and (c.queue='moderation' or public.admin_user_has_permission('legal.read'))
    and p_report.reason=c.request->>'reason' and p_report.reason_detail=c.request->>'detail'
    and p_report.reported_user_id=l.owner_id and p_report.target_kind=l.target_kind
    and p_report.notes='External removal request '||l.case_id::text
    and case l.target_kind when 'post' then p_report.post_id=l.target_id and p_report.comment_id is null and p_report.poll_vote_id is null
     when 'comment' then p_report.comment_id=l.target_id and p_report.post_id is null and p_report.poll_vote_id is null
     when 'poll_response' then p_report.poll_vote_id=l.target_id and p_report.post_id is null and p_report.comment_id is null
     when 'profile_photo' then p_report.reported_user_id=l.target_id and p_report.post_id is null and p_report.comment_id is null and p_report.poll_vote_id is null
     when 'account' then p_report.reported_user_id=l.target_id and p_report.post_id is null and p_report.comment_id is null and p_report.poll_vote_id is null
     else false end) then raise exception using errcode='42501',message='External report boundary rejected'; end if;
 insert into public.safety_removal_staff_budget values(auth.uid(),t,1) on conflict(actor_id) do update set
  used=case when safety_removal_staff_budget.window_at=t then safety_removal_staff_budget.used+1 else 1 end,window_at=t returning used into n;
 if n>10 then raise exception using errcode='P0001',message='Too many report handoffs; retry later'; end if;
end$$;

create function public.admin_create_safety_report_v1(p_id uuid,p_revision bigint,p_command_id uuid,p_input jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c public.safety_removal_cases%rowtype; prior public.safety_removal_receipts%rowtype; target jsonb;
 f text; kind text; target_id uuid; new_report_id uuid:=gen_random_uuid(); result jsonb; k text;
begin
 perform public.safety_removal_authorize_v1(true,p_id);
 if p_id is null or p_revision is null or p_command_id is null or jsonb_typeof(p_input) is distinct from 'object'
  or p_input-array['kind','target_id','fingerprint','note']<>'{}' or pg_column_size(p_input)>5000 then raise exception 'Invalid handoff'; end if;
 foreach k in array array['kind','target_id','fingerprint','note'] loop
  if jsonb_typeof(p_input->k) is distinct from 'string' then raise exception 'Complete the target review'; end if;
 end loop;
 if length(btrim(p_input->>'note')) not between 10 and 2000 or p_input->>'fingerprint' !~ '^[a-f0-9]{64}$' then raise exception 'Review rationale and inspected target required'; end if;
 f:=encode(extensions.digest(jsonb_build_array('create_report',p_id,p_revision,p_input)::text,'sha256'),'hex');
 perform pg_advisory_xact_lock(hashtextextended('safety-command:'||auth.uid()::text||p_command_id::text,0));
 select * into prior from public.safety_removal_receipts where actor_id=auth.uid() and command_id=p_command_id;
 if found then
  if prior.fingerprint<>f then raise exception 'Key belongs to another command'; end if;
  return prior.result;
 end if;
 select * into c from public.safety_removal_cases where id=p_id for update;
 if not found or c.closed_at is not null then raise exception 'Open removal request required'; end if;
 if c.revision<>p_revision then raise exception using errcode='40001',message='Case changed; reopen before deciding'; end if;
 if c.report_id is not null then raise exception 'A report is already linked; use the existing review'; end if;
 kind:=p_input->>'kind';target_id:=(p_input->>'target_id')::uuid;
 -- Lock the exact target so verification and report/quarantine commit together.
 case kind when 'post' then perform 1 from public.posts where id=target_id for update;
  when 'comment' then perform 1 from public.comments where id=target_id for update;
  when 'poll_response' then perform 1 from public.poll_votes where id=target_id for update;
  when 'profile_photo' then perform 1 from public.profiles where id=target_id for update;
  when 'account' then perform 1 from public.profiles where id=target_id for update;
  else raise exception 'Choose an exact content type'; end case;
 target:=public.get_admin_safety_target_v1(p_id,kind,target_id);
 if target->>'fingerprint'<>p_input->>'fingerprint' then raise exception using errcode='40001',message='Content changed; inspect it again before confirming'; end if;
 insert into public.safety_removal_report_links values(new_report_id,p_id,auth.uid(),kind,target_id,(target->>'owner_id')::uuid);
 insert into public.reports(id,reporter_id,reported_user_id,post_id,comment_id,poll_vote_id,target_kind,reason,reason_detail,notes)
 values(new_report_id,null,(target->>'owner_id')::uuid,case when kind='post' then target_id end,
  case when kind='comment' then target_id end,case when kind='poll_response' then target_id end,
  kind,c.request->>'reason',c.request->>'detail','External removal request '||p_id::text);
 insert into public.admin_report_triage(report_id,priority,queue,restricted_at,restricted_reason)
 values(new_report_id,c.priority,c.queue,case when c.queue='restricted_safety' then clock_timestamp() end,
 case when c.queue='restricted_safety' then c.request->>'detail' end)
 on conflict(report_id) do update set priority=excluded.priority,queue=excluded.queue,restricted_at=excluded.restricted_at,restricted_reason=excluded.restricted_reason;
 update public.safety_removal_cases set report_id=new_report_id,state='reviewing',
  revision=revision+1,updated_at=clock_timestamp() where id=p_id;
 insert into public.safety_removal_history(case_id,actor_id,action,internal_note)
 values(p_id,auth.uid(),'report_created',p_input->>'note');
 insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,request_id,metadata)
 values(auth.uid(),public.admin_current_operator_role(),'safety.report_created','safety_removal',p_id::text,p_command_id::text,jsonb_build_object('reportId',new_report_id));
 perform public.enqueue_domain_event('moderation:global','moderation.safety.updated',p_id,
  jsonb_build_object('caseId',p_id,'reportId',new_report_id),'safety-update:'||p_id::text||':'||(c.revision+1)::text);
 result:=jsonb_build_object('id',p_id,'report_id',new_report_id,'revision',c.revision+1,'outcome','saved');
 insert into public.safety_removal_receipts values(auth.uid(),p_command_id,f,result);
 return result;
end$$;
revoke all on function public.get_admin_safety_target_v1(uuid,text,uuid),public.authorize_safety_report_insert_v1(public.reports),
 public.admin_create_safety_report_v1(uuid,bigint,uuid,jsonb) from public,anon,authenticated,doji_employee,service_role;
grant execute on function public.get_admin_safety_target_v1(uuid,text,uuid),public.admin_create_safety_report_v1(uuid,bigint,uuid,jsonb) to doji_employee;

-- Exact source insertion retains the complete prior member/employee-update paths.
-- Abort instead of adapting an unknown deployed definition. Store originals for
-- guarded rollback; production preflight must also pin full source fingerprints.
do $patch$
declare original text; replacement text; marker text;
begin
 original:=pg_get_functiondef('public.trg_enforce_write_rate_limit()'::regprocedure);
 marker:='if auth.jwt()->>''role''=''doji_employee'' then';
 if position(marker in original)=0 or position('Employee write outside moderation boundary' in original)=0 then raise exception 'Unrecognized rate guard'; end if;
 replacement:=replace(original,marker,$insert$if tg_table_schema='public' and tg_table_name='reports' and tg_op='INSERT' and auth.jwt()->>'role'='doji_employee' then
    perform public.authorize_safety_report_insert_v1(new);
    return new;
  end if;
  if auth.jwt()->>'role'='doji_employee' then$insert$);
 execute replacement;
 insert into public.safety_removal_bridge_rollback values('public.trg_enforce_write_rate_limit()',original,md5(pg_get_functiondef('public.trg_enforce_write_rate_limit()'::regprocedure)));
 original:=pg_get_functiondef('public.publish_reporter_visibility_change()'::regprocedure);
 if original !~ 'begin\s+perform public.enqueue_domain_event' then raise exception 'Unrecognized reporter visibility trigger'; end if;
 replacement:=regexp_replace(original,'begin(\s+)perform public.enqueue_domain_event',E'begin\n  if new.reporter_id is null then return new; end if;\n  perform public.enqueue_domain_event');
 execute replacement;
 insert into public.safety_removal_bridge_rollback values('public.publish_reporter_visibility_change()',original,md5(pg_get_functiondef('public.publish_reporter_visibility_change()'::regprocedure)));
 original:=pg_get_functiondef('public.trg_report_notify_admin()'::regprocedure);
 if original !~ 'begin\s+perform public.doji_notify_admin_email' then raise exception 'Unrecognized report email trigger'; end if;
 replacement:=regexp_replace(original,'begin(\s+)perform public.doji_notify_admin_email',E'begin\n  if new.reporter_id is null and exists(select 1 from public.safety_removal_report_links where report_id=new.id) then return new; end if;\n  perform public.doji_notify_admin_email');
 execute replacement;
 insert into public.safety_removal_bridge_rollback values('public.trg_report_notify_admin()',original,md5(pg_get_functiondef('public.trg_report_notify_admin()'::regprocedure)));
end$patch$;
commit;
