-- Approved community idea retriage. Released 2026-09-27; see the release record.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter table public.admin_suggestion_reviews drop constraint admin_suggestion_reviews_decision_check;
alter table public.admin_suggestion_reviews add constraint admin_suggestion_reviews_decision_check check(decision in ('pending','approved','rejected'));
-- Bounded exact-challenge checks, including an overdue unclosed occurrence.
create index editorial_idea_open_event_idx on public.daily_events(challenge_id,fires_at) where closed_at is null;
-- One-time metadata recovery ONLY from exact authoritative approval receipts.
-- Never infer a relationship from matching challenge text or timing.
insert into public.admin_suggestion_reviews(suggestion_id,actor_id,decision,challenge_id,created_at)
select s.id,s.reviewed_by,'approved',matched.challenge_id,s.reviewed_at
from public.challenge_suggestions s
cross join lateral (
  select (min(r.result->>'challenge_id'))::uuid as challenge_id
  from public.command_receipts r
  where r.user_id=s.reviewed_by and r.result->>'id'=s.id::text
    and r.result->>'status'='approved' and r.result->>'user_id'=s.user_id::text
    and r.result->>'body'=s.body and r.result->>'kind'=s.kind
    and r.result->'options'=s.options and (r.result->>'reviewed_at')::timestamptz=s.reviewed_at
    and r.result->>'challenge_id' is not null
  having count(distinct r.result->>'challenge_id')=1
) matched
join public.challenges c on c.id=matched.challenge_id
where s.status='approved' and s.reviewed_by is not null and s.reviewed_at is not null
  and not exists(select 1 from public.admin_suggestion_reviews a where a.suggestion_id=s.id);
create function public.admin_idea_review_state_v1(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s public.challenge_suggestions%rowtype; linked uuid; active boolean; blocked text; event_id uuid; event_at timestamptz;
begin
 select * into s from public.challenge_suggestions where id=p_id;
 if not found then return '{}'::jsonb; end if;
 select r.challenge_id into linked from public.admin_suggestion_reviews r where r.suggestion_id=p_id;
 if s.user_id is null then blocked:='The submitting account is no longer available.';
 elsif linked is null and (s.status='approved' or s.selected_at is not null) then
   blocked:='The original challenge link is unavailable. This historical decision needs manual investigation.';
 elsif linked is not null then
   select c.is_active into active from public.challenges c where c.id=linked;
   if not found then blocked:='The linked challenge is unavailable. Review its history before changing this decision.';
   else
     select e.id,e.fires_at into event_id,event_at from public.daily_events e
       where e.challenge_id=linked and e.closed_at is null order by e.fires_at limit 1;
     if found then blocked:='This challenge has a scheduled or unclosed Doji. Its decision cannot change until that event is closed.';
     elsif active and not exists(select 1 from public.challenges c where c.is_active and c.id<>linked) then
       blocked:='Keep at least one eligible challenge in the pool before withdrawing this idea.';
     end if;
   end if;
 end if;
 return jsonb_build_object('review_blocked_reason',blocked,'pool_active',active,
   'scheduled_event_id',event_id,'scheduled_at',event_at,
   'allowed_actions',case when blocked is not null then '[]'::jsonb
     when s.status='pending' then '["approved","rejected"]'::jsonb
     when s.status='approved' then '["rejected","pending"]'::jsonb
     when s.status='rejected' then '["approved","pending"]'::jsonb else '[]'::jsonb end);
end $$;
revoke all on function public.admin_idea_review_state_v1(uuid) from public,anon,authenticated,doji_employee,service_role;
create or replace function public.admin_editorial_item_v1(p_kind text, p_id uuid)
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
      'created_at',s.created_at,'reviewed_at',s.reviewed_at,'selected_at',s.selected_at,'admin_note',s.admin_note,'username',p.username,
      'version',md5(to_jsonb(s)::text),'challenge_id',r.challenge_id,
      'reviewer_id',r.actor_id,'reviewer',coalesce(e.display_name,'Previous reviewer'),'author',coalesce(nullif(p.display_name,''),p.username,'Deleted member'))
    into v from public.challenge_suggestions s
    left join public.profiles p on p.id=s.user_id
    left join public.admin_suggestion_reviews r on r.suggestion_id=s.id
    left join public.admin_employees e on e.id=r.actor_id where s.id=p_id;
    v:=v||public.admin_idea_review_state_v1(p_id);
  else raise exception 'Invalid editorial collection'; end if;
  if v is null then raise exception using errcode='P0002',message='Item no longer available'; end if;
  return v;
end $$;

create or replace function public.admin_editorial_command_v1(p_kind text,p_action text,p_id uuid,
  p_version text,p_input jsonb,p_reason text,p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path = '' as $$
<<command>>
declare
  uid uuid:=auth.uid(); saved jsonb; fingerprint text; v_id uuid:=p_id; item jsonb;
  a public.app_announcements%rowtype; s public.challenge_suggestions%rowtype;
  lifecycle text; challenge_id uuid; challenge_type text; category text;
  needs_photo boolean:=false; needs_text boolean:=true; rule jsonb;
  starts timestamptz; ends timestamptz; label text; link text; reward_action text; reward_sparks integer;
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
        ('title','body','cta_label','cta_url','starts_at','ends_at','priority','max_impressions_per_user','min_hours_between_impressions','reward_action','reward_sparks')) then
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
        (link is not null and link not in ('/(app)/profile/shop','/(app)/suggest-challenge')) then
        raise exception 'Choose a supported in-app destination and button label'; end if;
      if p_action='save' and a.reward_action is not null and not (p_input ? 'reward_action' and p_input ? 'reward_sparks') then
        raise exception 'Refresh the portal before editing this reward campaign'; end if;
      reward_action:=p_input->>'reward_action';
      if (p_input ? 'reward_action' and jsonb_typeof(p_input->'reward_action') not in ('string','null'))
        or (p_input ? 'reward_sparks' and jsonb_typeof(p_input->'reward_sparks')<>'number')
        or coalesce(p_input->>'reward_sparks','0') !~ '^(0|[1-9][0-9]{0,4})$' then
        raise exception 'Invalid completion reward'; end if;
      reward_sparks:=coalesce(p_input->>'reward_sparks','0')::integer;
      if (reward_action is null and reward_sparks<>0)
        or (reward_action is not null and (reward_action<>'submit_idea' or reward_sparks not between 1 and 10000
          or link is distinct from '/(app)/suggest-challenge')) then
        raise exception 'Choose no reward or 1-10000 Sparks for a valid idea submission'; end if;
      if coalesce(p_input->>'priority','') not in ('0','10','20')
        or coalesce(p_input->>'max_impressions_per_user','') !~ '^(10|[1-9])$'
        or coalesce(p_input->>'min_hours_between_impressions','') !~ '^[1-9][0-9]{0,2}$'
        or (p_input->>'min_hours_between_impressions')::int>720 then raise exception 'Invalid display limits'; end if;
      if p_action='create' then
        insert into public.app_announcements(title,body,cta_label,cta_url,starts_at,ends_at,enabled,priority,max_impressions_per_user,min_hours_between_impressions,reward_action,reward_sparks)
        values(btrim(p_input->>'title'),btrim(p_input->>'body'),label,link,starts,ends,false,
          (p_input->>'priority')::int,(p_input->>'max_impressions_per_user')::int,(p_input->>'min_hours_between_impressions')::int,reward_action,reward_sparks)
        returning id into v_id;
        insert into public.admin_announcement_state(announcement_id,state,actor_id) values(v_id,'draft',uid);
      else
        update public.app_announcements set title=btrim(p_input->>'title'),body=btrim(p_input->>'body'),cta_label=label,cta_url=link,
          starts_at=starts,ends_at=ends,priority=(p_input->>'priority')::int,
          max_impressions_per_user=(p_input->>'max_impressions_per_user')::int,
          min_hours_between_impressions=(p_input->>'min_hours_between_impressions')::int,reward_action=command.reward_action,reward_sparks=command.reward_sparks,updated_at=clock_timestamp() where id=v_id;
      end if;
    else
      if p_input<>'{}'::jsonb then raise exception 'Lifecycle actions cannot edit content'; end if;
      if p_action='publish' and (a.ends_at is null or a.ends_at<=clock_timestamp()) then raise exception 'Draft window has expired. Edit it before publishing.'; end if;
      if p_action='publish' and a.cta_url is not null and a.cta_url not in ('/(app)/profile/shop','/(app)/suggest-challenge') then
        raise exception 'Edit the draft to choose Suggest a Doji or the Sparks shop'; end if;
      begin
        update public.app_announcements set enabled=(p_action='publish'),updated_at=clock_timestamp() where id=v_id;
      exception when exclusion_violation then
        raise exception using errcode='23P01',message='Another published announcement overlaps this window. Change the dates or cancel that announcement first.';
      end;
    end if;
    if p_action<>'create' then
      update public.admin_announcement_state set state=case p_action when 'publish' then 'published' when 'cancel' then 'cancelled' else state end,
        revision=revision+1,actor_id=uid,updated_at=clock_timestamp() where announcement_id=v_id;
    end if;
    perform public.enqueue_domain_event('moderation:global','moderation.announcement.'||p_action,v_id,
      jsonb_build_object('version',1,'announcementId',v_id),null);
  else
    if p_action not in ('approved','rejected','pending') or p_input<>'{}'::jsonb then raise exception 'Invalid review action'; end if;
    select * into s from public.challenge_suggestions where id=p_id for update;
    if not found then raise exception 'Idea no longer available'; end if;
    if p_version is distinct from md5(to_jsonb(s)::text) then raise exception using errcode='40001',message='Idea changed. Reload before deciding.'; end if;
    if s.user_id is null then raise exception 'The submitting account is no longer available'; end if;
    if s.status=p_action then raise exception 'This idea already has that status'; end if;
    -- Same lock as the unchanged production scheduler. Fail fast rather than
    -- queueing an administrative command in front of scheduling work.
    if not pg_try_advisory_xact_lock(hashtextextended('doji:prepare-next',0)) then
      raise exception 'Doji scheduling is in progress. Reload and try again.';
    end if;
    select r.challenge_id into challenge_id from public.admin_suggestion_reviews r where r.suggestion_id=p_id;
    if challenge_id is null and (s.status='approved' or s.selected_at is not null) then
      raise exception 'The original challenge link is unavailable. This historical decision needs manual investigation.';
    end if;
    if challenge_id is not null then
      perform 1 from public.challenges c where c.id=command.challenge_id for update nowait;
      if not found then raise exception 'The linked challenge is unavailable. Review its history before changing this decision.'; end if;
      if exists(select 1 from public.daily_events e where e.challenge_id=command.challenge_id and e.closed_at is null) then
        raise exception 'This challenge has a scheduled or unclosed Doji. Its decision cannot change until that event is closed.';
      end if;
      if p_action<>'approved' and not exists(select 1 from public.challenges c where c.is_active and c.id<>command.challenge_id) then
        raise exception 'Keep at least one eligible challenge in the pool before withdrawing this idea.';
      end if;
      update public.challenges c set is_active=(p_action='approved') where c.id=command.challenge_id;
    end if;
    if p_action='approved' and challenge_id is null then
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
      selected_at=case when p_action='approved' then coalesce(selected_at,clock_timestamp()) else selected_at end where id=p_id;
    insert into public.admin_suggestion_reviews(suggestion_id,actor_id,decision,challenge_id)
      values(p_id,uid,p_action,challenge_id)
      on conflict (suggestion_id) do update set actor_id=excluded.actor_id,
        decision=excluded.decision,challenge_id=excluded.challenge_id,created_at=clock_timestamp();
    -- Existing review push rules remain unchanged (at most one per outcome).
    -- Every revision, including reopening, must invalidate the owner's current
    -- status/bell even when that outcome's old push was already delivered.
    perform public.enqueue_domain_event('user:'||s.user_id::text||':events',
      'notification.suggestion.updated',p_id,
      jsonb_build_object('version',1,'suggestionId',p_id,'sendPush',false),null);
  end if;
  insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id,metadata)
  values(uid,public.admin_current_operator_role(),'editorial.'||p_action,
    case p_kind when 'announcements' then 'announcement' else 'suggestion' end,v_id::text,btrim(p_reason),p_idempotency_key,
    jsonb_build_object('contract','editorial.v1','challenge_id',challenge_id,'previous_status',s.status,'next_status',case when p_kind='suggestions' then p_action end)||case when p_kind='announcements' then (select jsonb_build_object('reward_action',x.reward_action,'reward_sparks',x.reward_sparks) from public.app_announcements x where x.id=v_id) else '{}'::jsonb end);
  saved:=public.admin_editorial_item_v1(p_kind,v_id);
  insert into public.admin_employee_command_receipts(user_id,idempotency_key,result)
  values(uid,p_idempotency_key,jsonb_build_object('operation','editorial.v1','fingerprint',fingerprint,'result',
    jsonb_build_object('id',v_id,'kind',p_kind,'action',p_action,'version',saved->>'version','outcome','saved')));
  return public.get_admin_editorial_item_v1(p_kind,v_id);
end $$;


commit;
