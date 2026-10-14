-- LOCAL rollback qualification only; production execution requires approval.
-- Disable future reward campaigns; retain earned balances, ledger and completion
-- history, new columns and the no-overlap constraint. Do not drop a paid receipt.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update public.app_announcements set enabled=false,updated_at=clock_timestamp() where enabled and reward_action is not null;
-- A legacy staff UI must not re-enable a reward promise after its handler is restored.
alter table public.app_announcements add constraint announcement_rewards_paused check (reward_action is null or not enabled);
create or replace function public.admin_editorial_command_v1(p_kind text,p_action text,p_id uuid,
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


create or replace function public.submit_challenge_suggestion(
  p_kind text,
  p_body text,
  p_body_hash text,
  p_options jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  suggestion_row public.challenge_suggestions%rowtype;
  saved jsonb;
  normalized_body text := btrim(p_body);
  normalized_options jsonb := coalesce(p_options, '[]'::jsonb);
  server_hash text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_kind not in ('poll', 'wyr', 'question', 'photo_idea', 'format_question') then
    raise exception 'Invalid suggestion kind';
  end if;
  if length(normalized_body) < 8 or length(normalized_body) > 500 then
    raise exception 'Invalid suggestion';
  end if;
  if octet_length(normalized_options::text) > 8192 then
    raise exception 'Suggestion options are too large';
  end if;

  if p_kind in ('poll', 'wyr') then
    if jsonb_typeof(normalized_options) is distinct from 'array' then
      raise exception 'Invalid suggestion options';
    end if;
    if jsonb_array_length(normalized_options) < 2
      or jsonb_array_length(normalized_options) > 8
      or (p_kind = 'wyr' and jsonb_array_length(normalized_options) <> 2)
    then
      raise exception 'Invalid suggestion options';
    end if;
    if exists (
      select 1
      from jsonb_array_elements(normalized_options) option_value
      where jsonb_typeof(option_value) is distinct from 'string'
        or length(btrim(option_value #>> '{}')) not between 1 and 100
    ) then
      raise exception 'Invalid suggestion options';
    end if;
  elsif p_kind in ('question', 'photo_idea') then
    if normalized_options <> '[]'::jsonb then
      raise exception 'This suggestion type does not accept options';
    end if;
  else
    if jsonb_typeof(normalized_options) is distinct from 'object'
      or jsonb_typeof(normalized_options->'answer_rule') is distinct from 'object'
      or coalesce(normalized_options->'answer_rule'->>'type', '')
        not in ('starts_with_letter', 'exact_word_count')
    then
      raise exception 'Invalid format rule';
    end if;
    if normalized_options->'answer_rule'->>'type' = 'starts_with_letter'
      and coalesce(normalized_options->'answer_rule'->>'letter', '') !~ '^[A-Za-z]$'
    then
      raise exception 'Invalid format rule';
    end if;
    if normalized_options->'answer_rule'->>'type' = 'exact_word_count' then
      if coalesce(normalized_options->'answer_rule'->>'count', '') !~ '^[0-9]+$' then
        raise exception 'Invalid format rule';
      end if;
      if (normalized_options->'answer_rule'->>'count')::integer not between 1 and 20 then
        raise exception 'Invalid format rule';
      end if;
    end if;
  end if;

  perform public.assert_acceptable_content(normalized_body);
  perform public.assert_acceptable_content(normalized_options::text);

  -- Intentionally ignore p_body_hash: it is caller-controlled and therefore
  -- cannot be an authoritative dedupe key.
  server_hash := encode(
    extensions.digest(
      jsonb_build_object(
        'kind', p_kind,
        'body', lower(regexp_replace(normalized_body, '\s+', ' ', 'g')),
        'options', normalized_options
      )::text,
      'sha256'
    ),
    'hex'
  );

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(uid::text || ':submit_challenge_suggestion:' || p_idempotency_key, 0)
  );
  select receipt.result into saved
  from public.command_receipts receipt
  where receipt.user_id = uid
    and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  insert into public.challenge_suggestions (user_id, kind, body, body_hash, options)
  values (uid, p_kind, normalized_body, server_hash, normalized_options)
  on conflict (body_hash) do nothing
  returning * into suggestion_row;

  if suggestion_row.id is null then
    raise exception 'This suggestion already exists';
  end if;

  saved := to_jsonb(suggestion_row);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end;
$$;


create or replace function public.claim_active_app_announcement()
returns table (
  id uuid,
  title text,
  body text,
  cta_label text,
  cta_url text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_announcement public.app_announcements%rowtype;
begin
  if v_user_id is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select announcement.* into v_announcement
  from public.app_announcements announcement
  left join public.app_announcement_receipts receipt
    on receipt.announcement_id = announcement.id and receipt.user_id = v_user_id
  where announcement.enabled
    and announcement.starts_at <= now()
    and (announcement.ends_at is null or announcement.ends_at > now())
    and receipt.dismissed_at is null
    and coalesce(receipt.impression_count, 0) < announcement.max_impressions_per_user
    and (
      receipt.last_impression_at is null
      or receipt.last_impression_at <= now() - make_interval(hours => announcement.min_hours_between_impressions)
    )
  order by announcement.priority desc, announcement.starts_at desc, announcement.id
  limit 1;

  if v_announcement.id is null then return; end if;

  insert into public.app_announcement_receipts (
    announcement_id, user_id, impression_count, first_impression_at, last_impression_at
  ) values (
    v_announcement.id, v_user_id, 1, now(), now()
  )
  on conflict (announcement_id, user_id) do update set
    impression_count = public.app_announcement_receipts.impression_count + 1,
    first_impression_at = coalesce(public.app_announcement_receipts.first_impression_at, now()),
    last_impression_at = now();

  return query select v_announcement.id, v_announcement.title, v_announcement.body,
    v_announcement.cta_label, v_announcement.cta_url;
end;
$$;

commit;
