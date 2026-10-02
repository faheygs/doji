-- Applied through the approved isolated editorial release, 2026-09-27.
-- See docs/ADMIN_EDITORIAL_RELEASE_2026-09-27.md; do not reapply to production.
-- Additive employee contracts; no replacement of member functions, grants or RLS.

set local lock_timeout='2s';
set local statement_timeout='8s';

-- Release planning must assess table size; use separately staged CONCURRENTLY
-- indexes if these cannot finish within the bounded migration lock budget.
create index editorial_announcements_page_idx on public.app_announcements(created_at desc,id desc);
create index editorial_suggestions_page_idx on public.challenge_suggestions(created_at desc,id desc);
create index editorial_suggestions_status_idx on public.challenge_suggestions(status,created_at desc,id desc);
create index editorial_audit_item_idx on public.admin_audit_log(entity_type,entity_id,occurred_at desc,id desc);

create table public.admin_announcement_state (
  announcement_id uuid primary key references public.app_announcements(id),
  state text not null check (state in ('draft','published','cancelled')),
  revision bigint not null default 1,
  actor_id uuid not null,
  updated_at timestamptz not null default clock_timestamp()
);
create table public.admin_suggestion_reviews (
  suggestion_id uuid primary key,
  actor_id uuid not null,
  decision text not null check (decision in ('approved','rejected')),
  challenge_id uuid,
  created_at timestamptz not null default clock_timestamp()
);
alter table public.admin_announcement_state enable row level security;
alter table public.admin_suggestion_reviews enable row level security;
revoke all on public.admin_announcement_state, public.admin_suggestion_reviews from public, anon, authenticated, doji_employee, service_role;

create function public.admin_editorial_authorize_v1(p_write boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'doji_employee'
    or coalesce(auth.jwt()->>'aal','') <> 'aal2' or auth.uid() is null then
    raise exception using errcode='42501', message='Verified employee access required';
  end if;
  -- Hold the employee row through the transaction; role revocation cannot race a write.
  if p_write then
    perform 1 from public.admin_employees where id=auth.uid() for share;
  end if;
  if not public.admin_user_has_permission(case when p_write then 'admin.manage' else 'operations.read' end) then
    raise exception using errcode='42501', message='Editorial permission required';
  end if;
end $$;

create function public.admin_editorial_item_v1(p_kind text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  if p_kind='announcements' then
    select to_jsonb(a) || jsonb_build_object(
      'version',md5(to_jsonb(a)::text || coalesce(to_jsonb(s)::text,'')),
      'managed',s.announcement_id is not null,
      'state',coalesce(s.state,'legacy'),
      'display_state',case when s.state in ('draft','cancelled') then s.state
        when not a.enabled then 'disabled' when a.ends_at<=now() then 'expired'
        when a.starts_at>now() then 'scheduled' else 'live' end)
    into v from public.app_announcements a
    left join public.admin_announcement_state s on s.announcement_id=a.id where a.id=p_id;
  elsif p_kind='suggestions' then
    select jsonb_build_object('id',s.id,'title',left(s.body,100),'body',s.body,'kind',s.kind,
      'options',s.options,'status',s.status,'state',s.status,'display_state',s.status,
      'created_at',s.created_at,'reviewed_at',s.reviewed_at,'admin_note',s.admin_note,
      'version',md5(to_jsonb(s)::text),'challenge_id',r.challenge_id,
      'reviewer_id',r.actor_id,'author',coalesce(nullif(p.display_name,''),p.username,'Deleted member'))
    into v from public.challenge_suggestions s
    left join public.profiles p on p.id=s.user_id
    left join public.admin_suggestion_reviews r on r.suggestion_id=s.id where s.id=p_id;
  else raise exception 'Invalid editorial collection'; end if;
  if v is null then raise exception using errcode='P0002',message='Item no longer available'; end if;
  return v;
end $$;

create function public.get_admin_editorial_item_v1(p_kind text,p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v jsonb; h jsonb;
begin
  perform public.admin_editorial_authorize_v1(false);
  v:=public.admin_editorial_item_v1(p_kind,p_id);
  select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc,x.id desc),'[]') into h
  from (select id,action,reason,occurred_at,actor_role from public.admin_audit_log
    where entity_type=case p_kind when 'announcements' then 'announcement' else 'suggestion' end
    and entity_id=p_id::text order by occurred_at desc,id desc limit 20) x;
  return v || jsonb_build_object('can_write',public.admin_user_has_permission('admin.manage'),'recent_history',h);
end $$;

create function public.get_admin_editorial_page_v1(p_kind text,p_limit integer default 25,
  p_before_at timestamptz default null,p_before_id uuid default null,p_filter text default 'all')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare ids uuid[]; v_id uuid; items jsonb:='[]'; item jsonb; cursor jsonb:=null; n integer:=0;
begin
  perform public.admin_editorial_authorize_v1(false);
  if p_limit is null or p_limit<1 or p_limit>50 or p_filter is null or (p_before_at is null)<>(p_before_id is null) then
    raise exception 'Invalid page parameters'; end if;
  if p_kind='announcements' then
    if p_filter not in ('all','draft','published','cancelled') then raise exception 'Invalid announcement filter'; end if;
    select array_agg(x.id order by x.created_at desc,x.id desc) into ids from (
      select a.id,a.created_at from public.app_announcements a
      left join public.admin_announcement_state s on s.announcement_id=a.id
      where (p_filter='all' or s.state=p_filter) and (p_before_at is null
        or (a.created_at,a.id)<(p_before_at,p_before_id)) order by a.created_at desc,a.id desc limit p_limit+1) x;
  elsif p_kind='suggestions' then
    if p_filter not in ('all','pending','approved','rejected') then raise exception 'Invalid idea filter'; end if;
    select array_agg(x.id order by x.created_at desc,x.id desc) into ids from (
      select id,created_at from public.challenge_suggestions where (p_filter='all' or status=p_filter) and (p_before_at is null
        or (created_at,id)<(p_before_at,p_before_id)) order by created_at desc,id desc limit p_limit+1) x;
  else raise exception 'Invalid editorial collection'; end if;
  foreach v_id in array coalesce(ids,'{}'::uuid[]) loop
    n:=n+1;
    if n>p_limit then
      cursor:=jsonb_build_object('at',item->>'created_at','id',item->>'id'); exit;
    end if;
    item:=public.admin_editorial_item_v1(p_kind,v_id);
    items:=items||jsonb_build_array(item - 'body' - 'options' - 'admin_note');
  end loop;
  return jsonb_build_object('items',items,'next_cursor',cursor,
    'can_write',public.admin_user_has_permission('admin.manage'));
end $$;

create function public.admin_editorial_command_v1(p_kind text,p_action text,p_id uuid,
  p_version text,p_input jsonb,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid:=auth.uid(); saved jsonb; fingerprint text; v_id uuid:=p_id; item jsonb;
  a public.app_announcements%rowtype; s public.challenge_suggestions%rowtype;
  lifecycle text; challenge_id uuid; challenge_type text; category text;
  needs_photo boolean:=false; needs_text boolean:=true; rule jsonb;
  starts timestamptz; ends timestamptz; label text; link text;
begin
  perform public.admin_editorial_authorize_v1(true);
  if p_kind is null or p_kind not in ('announcements','suggestions') or p_action is null
    or p_input is null or jsonb_typeof(p_input)<>'object' or octet_length(p_input::text)>8192
    or length(btrim(coalesce(p_reason,''))) not between 8 and 1000
    or length(coalesce(p_idempotency_key,'')) not between 16 and 128 then
    raise exception 'Invalid command'; end if;
  fingerprint:=encode(sha256(convert_to(jsonb_build_array(p_kind,p_action,p_id,p_version,p_input,btrim(p_reason))::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended(uid::text||':'||p_idempotency_key,0));
  select result into saved from public.admin_employee_command_receipts
    where user_id=uid and idempotency_key=p_idempotency_key;
  if found then
    if saved->>'operation' is distinct from 'editorial.v1' or saved->>'fingerprint' is distinct from fingerprint then
      raise exception 'Retry key belongs to a different command'; end if;
    -- Receipt keeps identifiers/outcome, not a second retained copy of member UGC.
    -- Return the authorized current record; preserve a committed outcome if it was deleted.
    begin
      return public.get_admin_editorial_item_v1(p_kind,(saved#>>'{result,id}')::uuid);
    exception when no_data_found then
      return (saved->'result')||jsonb_build_object('item_unavailable',true);
    end;
  end if;

  if p_kind='announcements' then
    if p_action not in ('create','save','publish','cancel') then raise exception 'Invalid announcement action'; end if;
    if p_action='create' then
      if p_id is not null or p_version is not null then raise exception 'New draft cannot have a prior version'; end if;
    else
      select * into a from public.app_announcements where id=p_id for update;
      if not found then raise exception 'Announcement no longer available'; end if;
      select state into lifecycle from public.admin_announcement_state where announcement_id=p_id for update;
      if lifecycle is null then raise exception 'Legacy announcement is read only'; end if;
      item:=public.admin_editorial_item_v1(p_kind,p_id);
      if p_version is distinct from item->>'version' then raise exception using errcode='40001',message='Item changed. Reload before deciding.'; end if;
      if (p_action in ('save','publish') and lifecycle<>'draft') or lifecycle='cancelled' then
        raise exception 'This lifecycle action is no longer available'; end if;
    end if;
    if p_action in ('create','save') then
      if exists(select 1 from jsonb_object_keys(p_input) k where k not in
        ('title','body','cta_label','cta_url','starts_at','ends_at','priority','max_impressions_per_user','min_hours_between_impressions')) then
        raise exception 'Unsupported announcement field'; end if;
      if jsonb_typeof(p_input->'title') is distinct from 'string' or jsonb_typeof(p_input->'body') is distinct from 'string'
        or length(btrim(p_input->>'title')) not between 1 and 100 or length(btrim(p_input->>'body')) not between 1 and 600 then
        raise exception 'Title and message are required'; end if;
      starts:=(p_input->>'starts_at')::timestamptz; ends:=(p_input->>'ends_at')::timestamptz;
      if starts is null or ends is null or not isfinite(starts) or not isfinite(ends) or ends<=starts then
        raise exception 'A valid start and end are required'; end if;
      label:=nullif(btrim(p_input->>'cta_label'),''); link:=nullif(btrim(p_input->>'cta_url'),'');
      -- Fixed in-app destinations only. Do not accept redirects, custom schemes or arbitrary URLs.
      if (label is null)<>(link is null) or length(label)>40 or
        (link is not null and link not in ('/(app)','/(app)/profile','/(app)/suggest-challenge')) then
        raise exception 'Choose a supported in-app destination and button label'; end if;
      if coalesce(p_input->>'priority','') not in ('0','10','20')
        or coalesce(p_input->>'max_impressions_per_user','') !~ '^(10|[1-9])$'
        or coalesce(p_input->>'min_hours_between_impressions','') !~ '^[1-9][0-9]{0,2}$'
        or (p_input->>'min_hours_between_impressions')::int>720 then raise exception 'Invalid display limits'; end if;
      if p_action='create' then
        insert into public.app_announcements(title,body,cta_label,cta_url,starts_at,ends_at,enabled,priority,max_impressions_per_user,min_hours_between_impressions)
        values(btrim(p_input->>'title'),btrim(p_input->>'body'),label,link,starts,ends,false,
          (p_input->>'priority')::int,(p_input->>'max_impressions_per_user')::int,(p_input->>'min_hours_between_impressions')::int)
        returning id into v_id;
        insert into public.admin_announcement_state(announcement_id,state,actor_id) values(v_id,'draft',uid);
      else
        update public.app_announcements set title=btrim(p_input->>'title'),body=btrim(p_input->>'body'),cta_label=label,cta_url=link,
          starts_at=starts,ends_at=ends,priority=(p_input->>'priority')::int,
          max_impressions_per_user=(p_input->>'max_impressions_per_user')::int,
          min_hours_between_impressions=(p_input->>'min_hours_between_impressions')::int,updated_at=clock_timestamp() where id=v_id;
      end if;
    else
      if p_input<>'{}'::jsonb then raise exception 'Lifecycle actions cannot edit content'; end if;
      if p_action='publish' and (a.ends_at is null or a.ends_at<=clock_timestamp()) then raise exception 'Draft window has expired. Edit it before publishing.'; end if;
      update public.app_announcements set enabled=(p_action='publish'),updated_at=clock_timestamp() where id=v_id;
    end if;
    if p_action<>'create' then
      update public.admin_announcement_state set state=case p_action when 'publish' then 'published' when 'cancel' then 'cancelled' else state end,
        revision=revision+1,actor_id=uid,updated_at=clock_timestamp() where announcement_id=v_id;
    end if;
    perform public.enqueue_domain_event('moderation:global','moderation.announcement.'||p_action,v_id,
      jsonb_build_object('version',1,'announcementId',v_id),null);
  else
    if p_action not in ('approved','rejected') or p_input<>'{}'::jsonb then raise exception 'Invalid review action'; end if;
    select * into s from public.challenge_suggestions where id=p_id for update;
    if not found then raise exception 'Idea no longer available'; end if;
    if p_version is distinct from md5(to_jsonb(s)::text) then raise exception using errcode='40001',message='Idea changed. Reload before deciding.'; end if;
    if s.status<>'pending' or s.user_id is null then raise exception 'This idea cannot be reviewed'; end if;
    if p_action='approved' then
      if s.kind in ('poll','wyr') then
        if jsonb_typeof(s.options) is distinct from 'array' then raise exception 'Invalid poll options'; end if;
        if jsonb_array_length(s.options) not between 2 and 8 or (s.kind='wyr' and jsonb_array_length(s.options)<>2)
          or exists(select 1 from jsonb_array_elements(s.options) o where jsonb_typeof(o)<>'string' or length(btrim(o#>>'{}')) not between 1 and 100) then
          raise exception 'Invalid poll options'; end if;
        challenge_type:='poll'; category:='social'; needs_text:=false;
      elsif s.kind='photo_idea' then challenge_type:='photo'; category:='creative'; needs_photo:=true; needs_text:=false;
      elsif s.kind='question' then challenge_type:='task'; category:='mental';
      elsif s.kind='format_question' then
        challenge_type:='format'; category:='mental'; rule:=s.options->'answer_rule';
        if rule is null or jsonb_typeof(rule)<>'object' or coalesce(rule->>'type','') not in ('starts_with_letter','exact_word_count')
          or (rule->>'type'='starts_with_letter' and coalesce(rule->>'letter','') !~ '^[A-Za-z]$')
          or (rule->>'type'='exact_word_count' and (coalesce(rule->>'count','') !~ '^([1-9]|1[0-9]|20)$')) then
          raise exception 'Invalid answer rule'; end if;
      else raise exception 'Unsupported idea kind'; end if;
      insert into public.challenges(title,description,type,poll_kind,category,difficulty,xp_reward,
        requires_photo,requires_video,requires_text,answer_rule,is_active,is_demo,schedule_count,emoji,participant_count)
      values(left(s.body,200),s.body,challenge_type,case when challenge_type='poll' then s.kind else null end,
        category,2,50,needs_photo,false,needs_text,rule,true,false,0,null,0) returning id into challenge_id;
      if s.kind in ('poll','wyr') then
        insert into public.poll_options(challenge_id,text,position,vote_count,is_other)
        select challenge_id,value,(ordinality-1)::int,0,false from jsonb_array_elements_text(s.options) with ordinality;
        if s.kind='poll' then
          insert into public.poll_options(challenge_id,text,position,vote_count,is_other) values(challenge_id,'Other',99,0,true);
        end if;
      end if;
    end if;
    -- One update invokes the existing reward, badge, member notification and staff event triggers.
    -- reviewed_by is member-profile-linked. Never manufacture a member profile for an employee.
    update public.challenge_suggestions set status=p_action,admin_note=btrim(p_reason),reviewed_at=clock_timestamp(),reviewed_by=null,
      selected_at=case when p_action='approved' then clock_timestamp() else selected_at end where id=p_id;
    insert into public.admin_suggestion_reviews(suggestion_id,actor_id,decision,challenge_id) values(p_id,uid,p_action,challenge_id);
  end if;
  insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id,metadata)
  values(uid,public.admin_current_operator_role(),'editorial.'||p_action,
    case p_kind when 'announcements' then 'announcement' else 'suggestion' end,v_id::text,btrim(p_reason),p_idempotency_key,
    jsonb_build_object('contract','editorial.v1','challenge_id',challenge_id));
  saved:=public.admin_editorial_item_v1(p_kind,v_id);
  insert into public.admin_employee_command_receipts(user_id,idempotency_key,result)
  values(uid,p_idempotency_key,jsonb_build_object('operation','editorial.v1','fingerprint',fingerprint,'result',
    jsonb_build_object('id',v_id,'kind',p_kind,'action',p_action,'version',saved->>'version','outcome','saved')));
  return public.get_admin_editorial_item_v1(p_kind,v_id);
end $$;

revoke all on function public.admin_editorial_authorize_v1(boolean),public.admin_editorial_item_v1(text,uuid),
  public.get_admin_editorial_item_v1(text,uuid),public.get_admin_editorial_page_v1(text,integer,timestamptz,uuid,text),
  public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text) from public,anon,authenticated,doji_employee,service_role;
grant execute on function public.get_admin_editorial_item_v1(text,uuid),public.get_admin_editorial_page_v1(text,integer,timestamptz,uuid,text),
  public.admin_editorial_command_v1(text,text,uuid,text,jsonb,text,text) to doji_employee;
