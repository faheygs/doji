-- Poll semantics are durable data, not a title heuristic. Generic polls may
-- include one custom "Other" option; Would You Rather always has two choices.
alter table public.challenges add column if not exists poll_kind text;

update public.challenges challenge
set poll_kind = case
  when challenge.type <> 'poll' then null
  when challenge.title ~* '^P[0-9]+:' then 'poll'
  when (
    select count(*) from public.poll_options option
    where option.challenge_id = challenge.id and option.is_other is not true
  ) > 2 then 'poll'
  else 'wyr'
end
where challenge.poll_kind is null or challenge.type <> 'poll';

alter table public.challenges drop constraint if exists challenges_poll_kind_check;
alter table public.challenges add constraint challenges_poll_kind_check check (
  (type = 'poll' and poll_kind in ('poll', 'wyr'))
  or (type <> 'poll' and poll_kind is null)
) not valid;
alter table public.challenges validate constraint challenges_poll_kind_check;

create or replace function public.trg_poll_vote_custom_text()
returns trigger language plpgsql set search_path = '' as $$
declare option_is_other boolean; kind text;
begin
  select option.is_other, challenge.poll_kind
  into option_is_other, kind
  from public.poll_options option
  join public.challenges challenge on challenge.id = option.challenge_id
  where option.id = new.option_id;

  if kind = 'wyr' and option_is_other then
    raise exception 'Would You Rather does not support Other';
  elsif option_is_other then
    if new.custom_text is null or length(trim(new.custom_text)) = 0 then
      raise exception 'custom_text required for Other option';
    end if;
  elsif new.custom_text is not null then
    raise exception 'custom_text only allowed for Other option';
  end if;
  return new;
end;
$$;

-- Review is atomic and preserves the suggestion kind on the created challenge.
create or replace function public.review_challenge_suggestion(
  p_suggestion_id uuid,
  p_status text,
  p_admin_note text,
  p_idempotency_key text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); suggestion_row public.challenge_suggestions%rowtype;
  v_challenge_id uuid; saved jsonb; challenge_type text; challenge_category text;
  needs_photo boolean; needs_text boolean; answer_rule jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if not exists (select 1 from public.profiles where id = uid and is_admin) then raise exception 'Admin access required'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  if p_idempotency_key is null or length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':' || p_idempotency_key, 0));
  select receipt.result into saved from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return saved; end if;

  select * into suggestion_row from public.challenge_suggestions
  where id = p_suggestion_id for update;
  if not found then raise exception 'Suggestion not found'; end if;
  if suggestion_row.status <> 'pending' then raise exception 'Suggestion was already reviewed'; end if;

  if p_status = 'approved' then
    if suggestion_row.kind in ('poll','wyr') then
      if jsonb_typeof(suggestion_row.options) <> 'array' or jsonb_array_length(suggestion_row.options) < 2 then
        raise exception 'Suggestion is missing poll options';
      end if;
      if suggestion_row.kind = 'wyr' and jsonb_array_length(suggestion_row.options) <> 2 then
        raise exception 'Would You Rather requires exactly two options';
      end if;
      challenge_type := 'poll'; challenge_category := 'social'; needs_photo := false; needs_text := false;
    elsif suggestion_row.kind = 'photo_idea' then
      challenge_type := 'photo'; challenge_category := 'creative'; needs_photo := true; needs_text := false;
    elsif suggestion_row.kind = 'format_question' then
      challenge_type := 'format'; challenge_category := 'mental'; needs_photo := false; needs_text := true;
      answer_rule := suggestion_row.options->'answer_rule';
      if answer_rule is null or jsonb_typeof(answer_rule) <> 'object' then raise exception 'Suggestion is missing an answer rule'; end if;
    else
      challenge_type := 'task'; challenge_category := 'mental'; needs_photo := false; needs_text := true;
    end if;

    insert into public.challenges (
      title, description, type, poll_kind, category, difficulty, xp_reward,
      requires_photo, requires_video, requires_text, answer_rule,
      is_active, is_demo, schedule_count, emoji, participant_count
    ) values (
      left(suggestion_row.body, 200), suggestion_row.body, challenge_type,
      case when challenge_type = 'poll' then suggestion_row.kind else null end,
      challenge_category, 2, 50, needs_photo, false, needs_text, answer_rule,
      true, false, 0, null, 0
    ) returning id into v_challenge_id;

    if suggestion_row.kind in ('poll','wyr') then
      insert into public.poll_options (challenge_id, text, position, vote_count, is_other)
      select v_challenge_id, left(value, 200), (ordinality - 1)::integer, 0, false
      from jsonb_array_elements_text(suggestion_row.options) with ordinality;
      if suggestion_row.kind = 'poll' then
        insert into public.poll_options (challenge_id, text, position, vote_count, is_other)
        values (v_challenge_id, 'Other', 99, 0, true);
      end if;
    end if;
  end if;

  update public.challenge_suggestions set
    status = p_status, admin_note = nullif(trim(p_admin_note), ''),
    reviewed_at = now(), reviewed_by = uid,
    selected_at = case when p_status = 'approved' then now() else selected_at end
  where id = p_suggestion_id returning * into suggestion_row;

  saved := to_jsonb(suggestion_row) || jsonb_build_object('challenge_id', v_challenge_id);
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, saved);
  return saved;
end;
$$;

-- The previous feed is retired only when a new occurrence actually activates.
create or replace function public.trg_purge_posts_when_event_activates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  delete from public.posts post
  where post.daily_event_id is not null and post.daily_event_id <> new.id;

  delete from public.posts post
  using public.user_events participant
  where post.user_event_id = participant.id
    and participant.daily_event_id <> new.id;
  return new;
end;
$$;

drop trigger if exists daily_event_purge_posts_on_activation on public.daily_events;
create trigger daily_event_purge_posts_on_activation
  after update of activated_at on public.daily_events
  for each row
  when (old.activated_at is null and new.activated_at is not null)
  execute function public.trg_purge_posts_when_event_activates();
