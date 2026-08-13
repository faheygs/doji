-- Production-like Doji tests can target an explicit cohort without changing
-- state, realtime, notifications, or feed visibility for any other account.
create table if not exists public.daily_event_audience (
  daily_event_id uuid not null references public.daily_events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default clock_timestamp(),
  primary key (daily_event_id, user_id)
);

alter table public.daily_event_audience enable row level security;
revoke all on table public.daily_event_audience from public, anon, authenticated;

create or replace function public.can_access_daily_event(
  p_daily_event_id uuid,
  p_viewer uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_viewer is not null and (
    not exists (
      select 1 from public.daily_event_audience audience
      where audience.daily_event_id = p_daily_event_id
    )
    or exists (
      select 1 from public.daily_event_audience audience
      where audience.daily_event_id = p_daily_event_id
        and audience.user_id = p_viewer
    )
  );
$$;

revoke all on function public.can_access_daily_event(uuid, uuid) from public, anon;
grant execute on function public.can_access_daily_event(uuid, uuid) to authenticated;

drop policy if exists daily_events_select_participant on public.daily_events;
drop policy if exists daily_events_select_all on public.daily_events;
drop policy if exists daily_events_select_authenticated on public.daily_events;
create policy daily_events_select_authenticated on public.daily_events
  for select to authenticated
  using (public.can_access_daily_event(id, auth.uid()));

create or replace function public.can_view_full_post(
  p_viewer uuid,
  p_user_event_id uuid,
  p_daily_event_id uuid,
  p_author uuid,
  p_is_community_poll boolean
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  event_id uuid;
begin
  if p_viewer is null then return false; end if;

  event_id := p_daily_event_id;
  if event_id is null and p_user_event_id is not null then
    select participant.daily_event_id into event_id
    from public.user_events participant
    where participant.id = p_user_event_id;
  end if;
  if event_id is null or not public.can_access_daily_event(event_id, p_viewer) then
    return false;
  end if;

  if not exists (
    select 1 from public.user_events viewer_event
    where viewer_event.daily_event_id = event_id
      and viewer_event.user_id = p_viewer
      and viewer_event.status in ('completed', 'late')
  ) then
    return false;
  end if;

  if coalesce(p_is_community_poll, false) or p_author = p_viewer then
    return true;
  end if;

  if exists (
    select 1 from public.friendships blocked
    where blocked.status = 'blocked'
      and ((blocked.requester_id = p_viewer and blocked.addressee_id = p_author)
        or (blocked.addressee_id = p_viewer and blocked.requester_id = p_author))
  ) then
    return false;
  end if;

  return exists (
    select 1 from public.user_events author_event
    where author_event.daily_event_id = event_id
      and author_event.user_id = p_author
      and author_event.status in ('completed', 'late')
  );
end;
$$;

revoke all on function public.can_view_full_post(uuid, uuid, uuid, uuid, boolean)
  from public, anon;
grant execute on function public.can_view_full_post(uuid, uuid, uuid, uuid, boolean)
  to authenticated;

drop policy if exists posts_select on public.posts;
create policy posts_select on public.posts
  for select to authenticated
  using (
    public.can_view_full_post(
      auth.uid(), user_event_id, daily_event_id, user_id, is_community_poll
    )
  );

create or replace function public.close_targeted_daily_event(p_daily_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
  target record;
begin
  if not exists (
    select 1 from public.daily_event_audience audience
    where audience.daily_event_id = p_daily_event_id
  ) then
    raise exception 'Targeted event not found';
  end if;

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

  for target in
    select audience.user_id
    from public.daily_event_audience audience
    where audience.daily_event_id = p_daily_event_id
  loop
    perform public.enqueue_domain_event(
      'user:' || target.user_id::text || ':events',
      'doji.closed',
      p_daily_event_id,
      jsonb_build_object(
        'targetUserId', target.user_id,
        'dailyEventId', p_daily_event_id,
        'closedAt', clock_timestamp()
      ),
      'targeted-doji-closed:' || p_daily_event_id::text || ':' || target.user_id::text
    );
  end loop;

  return changed;
end;
$$;

revoke all on function public.close_targeted_daily_event(uuid)
  from public, anon, authenticated;
grant execute on function public.close_targeted_daily_event(uuid) to service_role;

create or replace function public.start_targeted_doji_test(
  p_usernames text[],
  p_window_minutes integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  activation_time timestamptz := clock_timestamp();
  close_time timestamptz;
  challenge_row public.challenges%rowtype;
  event_row public.daily_events%rowtype;
  target record;
  target_count integer;
  orchestrator_url text;
  orchestrator_secret text;
begin
  if coalesce(array_length(p_usernames, 1), 0) <> 2 then
    raise exception 'Exactly two usernames are required';
  end if;
  if p_window_minutes < 1 or p_window_minutes > 10 then
    raise exception 'Window must be between 1 and 10 minutes';
  end if;

  select count(distinct profile.id) into target_count
  from public.profiles profile
  where lower(profile.username) in (
    select lower(trim(username)) from unnest(p_usernames) username
  ) and profile.is_banned is not true;
  if target_count <> 2 then raise exception 'Both target users must exist and be active'; end if;

  select decrypted_secret into orchestrator_url
  from vault.decrypted_secrets
  where name = 'doji_orchestrator_url'
  order by created_at desc limit 1;
  select decrypted_secret into orchestrator_secret
  from vault.decrypted_secrets
  where name = 'doji_orchestrator_secret'
  order by created_at desc limit 1;
  if orchestrator_url is null or orchestrator_secret is null then
    raise exception 'Durable Doji orchestrator is not configured';
  end if;

  select challenge.* into challenge_row
  from public.challenges challenge
  where challenge.is_active is true
    and challenge.type = 'poll'
    and exists (
      select 1 from public.poll_options option
      where option.challenge_id = challenge.id
      group by option.challenge_id
      having count(*) >= 2
    )
  order by random()
  limit 1;
  if not found then raise exception 'No active poll challenge is available'; end if;

  close_time := activation_time + make_interval(mins => p_window_minutes);
  insert into public.daily_events (
    challenge_id, fires_at, window_minutes, activated_at, closes_at
  ) values (
    challenge_row.id, activation_time, p_window_minutes, activation_time, close_time
  ) returning * into event_row;

  insert into public.daily_event_audience (daily_event_id, user_id)
  select event_row.id, profile.id
  from public.profiles profile
  where lower(profile.username) in (
    select lower(trim(username)) from unnest(p_usernames) username
  );

  insert into public.user_events (
    user_id, daily_event_id, status, expires_at, notified_at
  )
  select audience.user_id, event_row.id, 'pending', close_time, activation_time
  from public.daily_event_audience audience
  where audience.daily_event_id = event_row.id;

  for target in
    select profile.id, profile.username
    from public.profiles profile
    join public.daily_event_audience audience on audience.user_id = profile.id
    where audience.daily_event_id = event_row.id
  loop
    perform public.enqueue_domain_event(
      'user:' || target.id::text || ':events',
      'doji.activated',
      event_row.id,
      jsonb_build_object(
        'targetUserId', target.id,
        'dailyEventId', event_row.id,
        'challengeId', challenge_row.id,
        'title', 'It''s time to Doji!',
        'body', challenge_row.title || ' — you have ' || p_window_minutes::text || ' minutes.',
        'url', '/(app)/challenge',
        'activatedAt', activation_time,
        'closesAt', close_time,
        'sendPush', true
      ),
      'targeted-doji-activated:' || event_row.id::text || ':' || target.id::text
    );
  end loop;

  perform net.http_post(
    url := rtrim(orchestrator_url, '/') || '/events/' || event_row.id::text || '/alarm',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || orchestrator_secret
    ),
    body := jsonb_build_object(
      'dailyEventId', event_row.id,
      'phase', 'close',
      'firesAt', activation_time,
      'closesAt', close_time,
      'chainNext', false,
      'closeAction', 'close_targeted'
    ),
    timeout_milliseconds := 10000
  );

  return jsonb_build_object(
    'daily_event_id', event_row.id,
    'challenge_id', challenge_row.id,
    'challenge_title', challenge_row.title,
    'activated_at', activation_time,
    'closes_at', close_time,
    'target_usernames', p_usernames
  );
end;
$$;

revoke all on function public.start_targeted_doji_test(text[], integer)
  from public, anon, authenticated;
grant execute on function public.start_targeted_doji_test(text[], integer)
  to service_role;
