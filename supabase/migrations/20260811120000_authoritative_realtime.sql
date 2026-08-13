-- Authoritative Doji state + transactional realtime outbox.
-- The primary delivery path is event driven: a committed outbox INSERT wakes the
-- relay immediately through pg_net. There is no polling dispatcher in this design.

create extension if not exists pgcrypto;
create extension if not exists pg_net with schema extensions;

-- Retire the polling-based business pipeline. Future activation is performed by
-- one durable alarm calling activate_daily_event exactly once.
do $$
declare
  job record;
begin
  if to_regclass('cron.job') is null then return; end if;
  for job in
    select jobid
    from cron.job
    where jobname in (
      'doji_schedule_daily_challenge',
      'doji_dispatch_challenge_pushes',
      'doji_expire_events'
    )
  loop
    perform cron.unschedule(job.jobid);
  end loop;
end;
$$;

alter table public.daily_events
  add column if not exists activated_at timestamptz,
  add column if not exists closes_at timestamptz,
  add column if not exists closed_at timestamptz;

update public.daily_events
set activated_at = fires_at,
    closes_at = fires_at + make_interval(mins => least(window_minutes, 10))
where activated_at is null
  and fires_at <= now();

create index if not exists daily_events_live_idx
  on public.daily_events (activated_at desc, closes_at desc)
  where activated_at is not null;

create table if not exists public.domain_event_outbox (
  id uuid primary key default gen_random_uuid(),
  topic text not null,
  event_type text not null,
  aggregate_id uuid,
  idempotency_key text unique,
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0,
  lease_id uuid,
  leased_at timestamptz,
  published_at timestamptz,
  last_error text,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists domain_event_outbox_pending_idx
  on public.domain_event_outbox (created_at)
  where published_at is null;

alter table public.domain_event_outbox enable row level security;
revoke all on public.domain_event_outbox from public, anon, authenticated;

create table if not exists public.command_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key text not null,
  result jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, idempotency_key)
);
alter table public.command_receipts enable row level security;
revoke all on public.command_receipts from public, anon, authenticated;

create or replace function public.enqueue_domain_event(
  p_topic text,
  p_event_type text,
  p_aggregate_id uuid,
  p_payload jsonb,
  p_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key
  ) values (
    p_topic, p_event_type, p_aggregate_id, coalesce(p_payload, '{}'::jsonb), p_idempotency_key
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do update set idempotency_key = excluded.idempotency_key
  returning id into created_id;
  return created_id;
end;
$$;

revoke all on function public.enqueue_domain_event(text, text, uuid, jsonb, text)
  from public, anon, authenticated;

create or replace function public.claim_domain_events(p_batch_size integer default 100)
returns table (
  id uuid,
  topic text,
  event_type text,
  aggregate_id uuid,
  payload jsonb,
  attempts integer,
  lease_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_lease uuid := gen_random_uuid();
begin
  if p_batch_size < 1 or p_batch_size > 500 then
    raise exception 'batch size must be between 1 and 500';
  end if;

  return query
  with claimable as (
    select event.id
    from public.domain_event_outbox event
    where event.published_at is null
      and (event.leased_at is null or event.leased_at < clock_timestamp() - interval '2 minutes')
    order by event.created_at
    for update skip locked
    limit p_batch_size
  ), claimed as (
    update public.domain_event_outbox event
    set lease_id = next_lease,
        leased_at = clock_timestamp(),
        attempts = event.attempts + 1,
        last_error = null
    from claimable
    where event.id = claimable.id
    returning event.id, event.topic, event.event_type, event.aggregate_id,
              event.payload, event.attempts, event.lease_id
  )
  select * from claimed;
end;
$$;

create or replace function public.complete_domain_event(p_event_id uuid, p_lease_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.domain_event_outbox
    set published_at = clock_timestamp(), lease_id = null, leased_at = null
    where id = p_event_id and lease_id = p_lease_id and published_at is null
    returning id
  )
  select exists(select 1 from completed);
$$;

create or replace function public.release_domain_event(
  p_event_id uuid,
  p_lease_id uuid,
  p_error text default null
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with released as (
    update public.domain_event_outbox
    set lease_id = null,
        leased_at = null,
        last_error = left(p_error, 1000)
    where id = p_event_id and lease_id = p_lease_id and published_at is null
    returning id
  )
  select exists(select 1 from released);
$$;

revoke all on function public.claim_domain_events(integer) from public, anon, authenticated;
revoke all on function public.complete_domain_event(uuid, uuid) from public, anon, authenticated;
revoke all on function public.release_domain_event(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.claim_domain_events(integer) to service_role;
grant execute on function public.complete_domain_event(uuid, uuid) to service_role;
grant execute on function public.release_domain_event(uuid, uuid, text) to service_role;

create or replace function public.wake_domain_event_relay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  orchestrator_url text;
  orchestrator_secret text;
begin
  select decrypted_secret into orchestrator_url
  from vault.decrypted_secrets
  where name = 'doji_orchestrator_url'
  order by created_at desc limit 1;

  select decrypted_secret into orchestrator_secret
  from vault.decrypted_secrets
  where name = 'doji_orchestrator_secret'
  order by created_at desc limit 1;

  if orchestrator_url is null or orchestrator_secret is null then return null; end if;

  perform net.http_post(
    url := rtrim(orchestrator_url, '/') || '/outbox/wake',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || orchestrator_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
end;
$$;

revoke all on function public.wake_domain_event_relay() from public, anon, authenticated;
drop trigger if exists wake_domain_event_relay_after_insert on public.domain_event_outbox;
create trigger wake_domain_event_relay_after_insert
after insert on public.domain_event_outbox
for each statement execute function public.wake_domain_event_relay();

-- One authoritative state read. The server, never the handset clock, determines phase.
create or replace function public.get_current_doji_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  current_time timestamptz := clock_timestamp();
  event_row record;
  phase text;
  event_json jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select ue.*, de.fires_at, de.window_minutes, de.activated_at, de.closes_at,
         de.closed_at, de.challenge_id, de.created_at as daily_created_at,
         to_jsonb(ch) as challenge_json
  into event_row
  from public.user_events ue
  join public.daily_events de on de.id = ue.daily_event_id
  join public.challenges ch on ch.id = de.challenge_id
  where ue.user_id = uid
  order by coalesce(de.activated_at, de.fires_at) desc, de.created_at desc
  limit 1;

  if not found then
    return jsonb_build_object('server_now', current_time, 'phase', 'none', 'user_event', null);
  end if;

  phase := case
    when event_row.status in ('completed', 'late') then 'completed'
    when event_row.activated_at is null then 'waiting'
    when current_time < event_row.activated_at then 'waiting'
    when current_time >= coalesce(event_row.closes_at, event_row.expires_at) then 'missed'
    else 'live'
  end;

  event_json := to_jsonb(event_row)
    - 'fires_at' - 'window_minutes' - 'activated_at' - 'closes_at'
    - 'closed_at' - 'challenge_id' - 'daily_created_at' - 'challenge_json';
  event_json := event_json || jsonb_build_object(
    'status', case when phase = 'missed' and event_row.status = 'pending' then 'missed' else event_row.status end,
    'daily_event', jsonb_build_object(
      'id', event_row.daily_event_id,
      'challenge_id', event_row.challenge_id,
      'fires_at', event_row.fires_at,
      'window_minutes', event_row.window_minutes,
      'activated_at', event_row.activated_at,
      'closes_at', event_row.closes_at,
      'closed_at', event_row.closed_at,
      'created_at', event_row.daily_created_at,
      'challenge', event_row.challenge_json
    ),
    'challenge', event_row.challenge_json
  );

  return jsonb_build_object(
    'server_now', current_time,
    'phase', phase,
    'opens_at', event_row.activated_at,
    'closes_at', coalesce(event_row.closes_at, event_row.expires_at),
    'user_event', event_json
  );
end;
$$;

revoke all on function public.get_current_doji_state() from public, anon;
grant execute on function public.get_current_doji_state() to authenticated;

-- Called by the durable alarm. Idempotent and serialized by a row lock.
create or replace function public.activate_daily_event(p_daily_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row record;
  activation_time timestamptz := clock_timestamp();
  close_time timestamptz;
  profile_row record;
begin
  select de.*, ch.title, ch.category
  into event_row
  from public.daily_events de
  join public.challenges ch on ch.id = de.challenge_id
  where de.id = p_daily_event_id
  for update of de;
  if not found then raise exception 'Daily event not found'; end if;

  if event_row.activated_at is not null then
    return jsonb_build_object(
      'daily_event_id', event_row.id,
      'activated_at', event_row.activated_at,
      'closes_at', event_row.closes_at,
      'already_active', true
    );
  end if;

  close_time := activation_time + make_interval(mins => least(event_row.window_minutes, 10));
  update public.daily_events
  set fires_at = activation_time,
      activated_at = activation_time,
      closes_at = close_time
  where id = event_row.id;

  insert into public.user_events (user_id, daily_event_id, status, expires_at, notified_at)
  select profile.id, event_row.id, 'pending', close_time, activation_time
  from public.profiles profile
  where profile.is_banned is not true
  on conflict (user_id, daily_event_id) do update
  set expires_at = excluded.expires_at,
      notified_at = excluded.notified_at;

  perform public.enqueue_domain_event(
    'doji:global', 'doji.activated', event_row.id,
    jsonb_build_object(
      'dailyEventId', event_row.id,
      'challengeId', event_row.challenge_id,
      'activatedAt', activation_time,
      'closesAt', close_time,
      'windowMinutes', least(event_row.window_minutes, 10)
    ),
    'doji-activated:' || event_row.id::text
  );

  for profile_row in
    select profile.id
    from public.profiles profile
    where profile.is_banned is not true
      and coalesce((profile.notification_preferences ->> 'doji_start')::boolean, true)
  loop
    perform public.enqueue_domain_event(
      'user:' || profile_row.id::text || ':events',
      'doji.activated', event_row.id,
      jsonb_build_object(
        'targetUserId', profile_row.id,
        'dailyEventId', event_row.id,
        'challengeId', event_row.challenge_id,
        'title', 'It''s time to Doji!',
        'body', event_row.title || ' — you have 10 minutes.',
        'url', '/(app)/challenge',
        'activatedAt', activation_time,
        'closesAt', close_time,
        'sendPush', true
      ),
      'doji-user-activated:' || event_row.id::text || ':' || profile_row.id::text
    );
  end loop;

  return jsonb_build_object(
    'daily_event_id', event_row.id,
    'activated_at', activation_time,
    'closes_at', close_time,
    'already_active', false
  );
end;
$$;

revoke all on function public.activate_daily_event(uuid) from public, anon, authenticated;
grant execute on function public.activate_daily_event(uuid) to service_role;

create or replace function public.close_daily_event(p_daily_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.daily_events
  set closed_at = coalesce(closed_at, clock_timestamp())
  where id = p_daily_event_id
    and activated_at is not null
    and clock_timestamp() >= closes_at;
  if not found then return 0; end if;

  update public.user_events
  set status = 'missed'
  where daily_event_id = p_daily_event_id and status = 'pending';
  get diagnostics changed = row_count;

  perform public.enqueue_domain_event(
    'doji:global', 'doji.closed', p_daily_event_id,
    jsonb_build_object('dailyEventId', p_daily_event_id, 'closedAt', clock_timestamp()),
    'doji-closed:' || p_daily_event_id::text
  );
  return changed;
end;
$$;

revoke all on function public.close_daily_event(uuid) from public, anon, authenticated;
grant execute on function public.close_daily_event(uuid) to service_role;

-- Poll votes are tied to an occurrence, not forever to a reusable challenge.
alter table public.poll_votes
  add column if not exists user_event_id uuid references public.user_events(id) on delete cascade,
  add column if not exists idempotency_key text;
alter table public.poll_votes drop constraint if exists poll_votes_user_id_challenge_id_key;
create unique index if not exists poll_votes_user_event_unique
  on public.poll_votes (user_event_id) where user_event_id is not null;
create unique index if not exists poll_votes_idempotency_unique
  on public.poll_votes (idempotency_key) where idempotency_key is not null;

alter table public.posts add column if not exists idempotency_key text;
create unique index if not exists posts_idempotency_unique
  on public.posts (idempotency_key) where idempotency_key is not null;

create or replace function public.submit_poll_vote(
  p_user_event_id uuid,
  p_option_id uuid,
  p_custom_text text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  event_row record;
  vote_row record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  select ue.*, de.challenge_id, de.activated_at, de.closes_at
  into event_row
  from public.user_events ue
  join public.daily_events de on de.id = ue.daily_event_id
  where ue.id = p_user_event_id and ue.user_id = uid
  for update of ue;
  if not found then raise exception 'Doji not found'; end if;

  select * into vote_row from public.poll_votes where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(vote_row); end if;

  if event_row.status not in ('pending', 'buy_in_open') then raise exception 'Doji is no longer open'; end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then raise exception 'Doji is not live yet'; end if;
  if clock_timestamp() >= coalesce(event_row.closes_at, event_row.expires_at) then raise exception 'Doji has closed'; end if;
  if not exists (
    select 1 from public.poll_options option
    where option.id = p_option_id and option.challenge_id = event_row.challenge_id
  ) then raise exception 'Invalid poll option'; end if;

  insert into public.poll_votes (
    user_id, challenge_id, option_id, custom_text, user_event_id, idempotency_key
  ) values (
    uid, event_row.challenge_id, p_option_id, nullif(trim(p_custom_text), ''),
    p_user_event_id, p_idempotency_key
  ) returning * into vote_row;

  update public.user_events
  set status = 'completed', completed_at = clock_timestamp()
  where id = p_user_event_id;

  perform public.enqueue_domain_event(
    'doji:global', 'poll.vote.created', vote_row.id,
    jsonb_build_object(
      'voteId', vote_row.id,
      'dailyEventId', event_row.daily_event_id,
      'challengeId', event_row.challenge_id,
      'optionId', p_option_id,
      'userId', uid
    ),
    'poll-vote:' || vote_row.id::text
  );
  return to_jsonb(vote_row);
end;
$$;

revoke all on function public.submit_poll_vote(uuid, uuid, text, text) from public, anon;
grant execute on function public.submit_poll_vote(uuid, uuid, text, text) to authenticated;

create or replace function public.complete_doji_with_post(
  p_user_event_id uuid,
  p_post_type text,
  p_caption text,
  p_photo_url text,
  p_front_photo_url text,
  p_video_url text,
  p_visibility text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  event_row record;
  post_row record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  select ue.*, de.activated_at, de.closes_at
  into event_row
  from public.user_events ue
  join public.daily_events de on de.id = ue.daily_event_id
  where ue.id = p_user_event_id and ue.user_id = uid
  for update of ue;
  if not found then raise exception 'Doji not found'; end if;

  select * into post_row from public.posts where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(post_row); end if;

  if event_row.status not in ('pending', 'buy_in_open') then raise exception 'Doji is no longer open'; end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then raise exception 'Doji is not live yet'; end if;
  if clock_timestamp() >= coalesce(event_row.closes_at, event_row.expires_at) then raise exception 'Doji has closed'; end if;

  insert into public.posts (
    user_event_id, user_id, type, caption, photo_url, front_photo_url,
    video_url, is_late, visibility, idempotency_key
  ) values (
    p_user_event_id, uid, p_post_type, nullif(trim(p_caption), ''), p_photo_url,
    p_front_photo_url, p_video_url, event_row.status = 'buy_in_open',
    p_visibility, p_idempotency_key
  ) returning * into post_row;

  update public.user_events
  set status = case when event_row.status = 'buy_in_open' then 'late' else 'completed' end,
      completed_at = clock_timestamp()
  where id = p_user_event_id;

  return to_jsonb(post_row);
end;
$$;

revoke all on function public.complete_doji_with_post(uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.complete_doji_with_post(uuid, text, text, text, text, text, text, text)
  to authenticated;

create or replace function public.toggle_post_reaction(
  p_post_id uuid,
  p_emoji text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing_emoji text;
  is_active boolean;
  total integer;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if p_emoji not in ('fire', 'like', 'dislike', 'laugh', 'wow', 'heart') then raise exception 'Invalid reaction'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_post_id::text || ':' || uid::text, 0));

  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select emoji into existing_emoji
  from public.reactions
  where post_id = p_post_id and user_id = uid
  order by created_at desc limit 1;

  delete from public.reactions where post_id = p_post_id and user_id = uid;
  if existing_emoji is distinct from p_emoji then
    insert into public.reactions (post_id, user_id, emoji) values (p_post_id, uid, p_emoji);
    is_active := true;
  else
    is_active := false;
  end if;

  select count(*)::integer into total from public.reactions where post_id = p_post_id;
  final_result := jsonb_build_object(
    'post_id', p_post_id, 'emoji', p_emoji, 'active', is_active, 'count', total
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.toggle_post_reaction(uuid, text, text) from public, anon;
grant execute on function public.toggle_post_reaction(uuid, text, text) to authenticated;

create or replace function public.toggle_comment_like(
  p_comment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_active boolean;
  total integer;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_comment_id::text || ':' || uid::text, 0));
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;
  if exists(select 1 from public.comment_likes where comment_id = p_comment_id and user_id = uid) then
    delete from public.comment_likes where comment_id = p_comment_id and user_id = uid;
    is_active := false;
  else
    insert into public.comment_likes (comment_id, user_id) values (p_comment_id, uid);
    is_active := true;
  end if;
  select count(*)::integer into total from public.comment_likes where comment_id = p_comment_id;
  final_result := jsonb_build_object(
    'comment_id', p_comment_id, 'active', is_active, 'count', total
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.toggle_comment_like(uuid, text) from public, anon;
grant execute on function public.toggle_comment_like(uuid, text) to authenticated;

alter table public.comments add column if not exists idempotency_key text;
create unique index if not exists comments_idempotency_unique
  on public.comments (idempotency_key) where idempotency_key is not null;

create or replace function public.submit_comment(
  p_post_id uuid,
  p_body text,
  p_parent_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  comment_row record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  if length(trim(p_body)) < 1 then raise exception 'Comment cannot be empty'; end if;

  select * into comment_row
  from public.comments where idempotency_key = p_idempotency_key;
  if found then return to_jsonb(comment_row); end if;

  if not exists(select 1 from public.posts post where post.id = p_post_id and not post.comments_disabled) then
    raise exception 'Comments are not available';
  end if;
  if p_parent_id is not null and not exists(
    select 1 from public.comments parent where parent.id = p_parent_id and parent.post_id = p_post_id
  ) then raise exception 'Reply target not found'; end if;

  insert into public.comments (post_id, user_id, body, parent_id, idempotency_key)
  values (p_post_id, uid, trim(p_body), p_parent_id, p_idempotency_key)
  returning * into comment_row;
  return to_jsonb(comment_row);
end;
$$;

revoke all on function public.submit_comment(uuid, text, uuid, text) from public, anon;
grant execute on function public.submit_comment(uuid, text, uuid, text) to authenticated;

-- Core social changes are converted to versioned domain messages. Payloads hold
-- identifiers only; clients fetch authorized rows through RLS.
create or replace function public.publish_core_social_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid := coalesce(new.id, old.id);
  post_id uuid;
  owner_id uuid;
  post_visibility text;
  event_name text;
  friend_row record;
begin
  event_name := case tg_table_name
    when 'posts' then 'feed.post.' || lower(tg_op)
    when 'reactions' then 'feed.reaction.' || lower(tg_op)
    when 'comments' then 'feed.comment.' || lower(tg_op)
    when 'comment_likes' then 'feed.comment_like.' || lower(tg_op)
    else 'feed.updated'
  end;

  if tg_table_name = 'posts' then
    post_id := row_id;
    owner_id := coalesce(new.user_id, old.user_id);
    post_visibility := coalesce(new.visibility, old.visibility);
  elsif tg_table_name = 'reactions' then
    post_id := coalesce(new.post_id, old.post_id);
  elsif tg_table_name = 'comments' then
    post_id := coalesce(new.post_id, old.post_id);
  else
    select comment.post_id into post_id
    from public.comments comment
    where comment.id = coalesce(new.comment_id, old.comment_id);
  end if;

  if owner_id is null then
    select post.user_id, post.visibility into owner_id, post_visibility
    from public.posts post where post.id = post_id;
  end if;

  if post_visibility = 'public' then
    perform public.enqueue_domain_event(
      'feed:public', event_name, row_id,
      jsonb_build_object('version', 1, 'postId', post_id, 'entityId', row_id),
      null
    );
  end if;

  if owner_id is not null then
    perform public.enqueue_domain_event(
      'user:' || owner_id::text || ':events', event_name, row_id,
      jsonb_build_object('version', 1, 'postId', post_id, 'entityId', row_id), null
    );
    for friend_row in
      select case when friendship.requester_id = owner_id
                  then friendship.addressee_id else friendship.requester_id end as id
      from public.friendships friendship
      where friendship.status = 'accepted'
        and (friendship.requester_id = owner_id or friendship.addressee_id = owner_id)
    loop
      perform public.enqueue_domain_event(
        'user:' || friend_row.id::text || ':events', event_name, row_id,
        jsonb_build_object('version', 1, 'postId', post_id, 'entityId', row_id), null
      );
    end loop;
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function public.publish_core_social_change() from public, anon, authenticated;
drop trigger if exists publish_post_change on public.posts;
create trigger publish_post_change after insert or update or delete on public.posts
for each row execute function public.publish_core_social_change();
drop trigger if exists publish_reaction_change on public.reactions;
create trigger publish_reaction_change after insert or update or delete on public.reactions
for each row execute function public.publish_core_social_change();
drop trigger if exists publish_comment_change on public.comments;
create trigger publish_comment_change after insert or update or delete on public.comments
for each row execute function public.publish_core_social_change();
drop trigger if exists publish_comment_like_change on public.comment_likes;
create trigger publish_comment_like_change after insert or delete on public.comment_likes
for each row execute function public.publish_core_social_change();
