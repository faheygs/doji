-- Twenty minutes before a production Doji activates, atomically retire the
-- previous feed and expose a safe, challenge-free "coming soon" state.
alter table public.daily_events
  add column if not exists prelive_at timestamptz;

create or replace function public.begin_daily_event_prelive(p_daily_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_row public.daily_events%rowtype;
  prelive_time timestamptz := clock_timestamp();
begin
  select * into event_row
  from public.daily_events
  where id = p_daily_event_id
  for update;

  if not found then raise exception 'Daily event not found'; end if;

  if event_row.activated_at is not null then
    return jsonb_build_object(
      'daily_event_id', event_row.id,
      'prelive_at', event_row.prelive_at,
      'fires_at', event_row.fires_at,
      'already_active', true
    );
  end if;

  if event_row.prelive_at is not null then
    return jsonb_build_object(
      'daily_event_id', event_row.id,
      'prelive_at', event_row.prelive_at,
      'fires_at', event_row.fires_at,
      'already_started', true
    );
  end if;

  if prelive_time < event_row.fires_at - interval '20 minutes 5 seconds' then
    raise exception 'Pre-live window has not started';
  end if;

  update public.daily_events
  set prelive_at = prelive_time
  where id = event_row.id;

  -- Comments, reactions, comment likes, and related feed state cascade from
  -- these posts. Historical occurrence and poll-vote records remain intact.
  delete from public.posts post
  where post.daily_event_id is not null
    and post.daily_event_id <> event_row.id;

  delete from public.posts post
  using public.user_events participant
  where post.user_event_id = participant.id
    and participant.daily_event_id <> event_row.id;

  perform public.enqueue_domain_event(
    'doji:global',
    'doji.pre_live',
    event_row.id,
    jsonb_build_object(
      'dailyEventId', event_row.id,
      'preliveAt', prelive_time,
      'firesAt', event_row.fires_at
    ),
    'doji-pre-live:' || event_row.id::text
  );

  return jsonb_build_object(
    'daily_event_id', event_row.id,
    'prelive_at', prelive_time,
    'fires_at', event_row.fires_at,
    'already_started', false
  );
end;
$$;

revoke all on function public.begin_daily_event_prelive(uuid)
  from public, anon, authenticated;
grant execute on function public.begin_daily_event_prelive(uuid) to service_role;

create or replace function public.get_upcoming_doji_state()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  server_now_ts timestamptz := clock_timestamp();
  event_row public.daily_events%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;

  select * into event_row
  from public.daily_events
  where prelive_at is not null
    and activated_at is null
    and closed_at is null
    and not exists (
      select 1 from public.daily_event_audience audience
      where audience.daily_event_id = daily_events.id
    )
    and fires_at > server_now_ts - interval '1 minute'
  order by fires_at asc
  limit 1;

  if not found then return null; end if;

  return jsonb_build_object(
    'server_now', server_now_ts,
    'daily_event_id', event_row.id,
    'prelive_at', event_row.prelive_at,
    'fires_at', event_row.fires_at
  );
end;
$$;

revoke all on function public.get_upcoming_doji_state() from public, anon;
grant execute on function public.get_upcoming_doji_state() to authenticated;

-- Re-register the already-prepared production event so this deployment also
-- upgrades the next alarm instead of waiting for the following daily chain.
do $$
declare
  event_row record;
  orchestrator_url text;
  orchestrator_secret text;
begin
  select id, fires_at into event_row
  from public.daily_events
  where activated_at is null
    and closed_at is null
    and fires_at > clock_timestamp()
    and not exists (
      select 1 from public.daily_event_audience audience
      where audience.daily_event_id = daily_events.id
    )
  order by fires_at asc
  limit 1;

  if not found then return; end if;

  select decrypted_secret into orchestrator_url
  from vault.decrypted_secrets
  where name = 'doji_orchestrator_url'
  limit 1;

  select decrypted_secret into orchestrator_secret
  from vault.decrypted_secrets
  where name = 'doji_orchestrator_secret'
  limit 1;

  if orchestrator_url is null or orchestrator_secret is null then return; end if;

  perform net.http_post(
    url := rtrim(orchestrator_url, '/') || '/events/' || event_row.id::text || '/alarm',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || orchestrator_secret,
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'dailyEventId', event_row.id,
      'firesAt', event_row.fires_at,
      'phase', 'prelive'
    )
  );
end;
$$;
