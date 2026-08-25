-- Notification history is monotonic, but device clocks are not trusted.
-- Use server time for user actions and clamp state imported from offline
-- devices so a clock set in the future cannot hide future activity forever.

create or replace function public.sync_notification_center_state(
  p_cleared_at timestamptz,
  p_last_opened_at timestamptz,
  p_dismissals jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  server_now timestamptz := clock_timestamp();
  safe_cleared_at timestamptz;
  safe_opened_at timestamptz;
  state_row public.notification_center_state%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_dismissals is null or jsonb_typeof(p_dismissals) <> 'object' then
    raise exception 'Invalid dismissals';
  end if;
  if jsonb_object_length(p_dismissals) > 2000 then
    raise exception 'Too many dismissals';
  end if;

  safe_cleared_at := case
    when p_cleared_at is null then null
    else least(p_cleared_at, server_now)
  end;
  safe_opened_at := case
    when p_last_opened_at is null then null
    else least(p_last_opened_at, server_now)
  end;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':notification-center', 0));

  insert into public.notification_center_state (user_id, cleared_at, last_opened_at, updated_at)
  values (uid, safe_cleared_at, safe_opened_at, server_now)
  on conflict (user_id) do update set
    cleared_at = case
      when public.notification_center_state.cleared_at is null then excluded.cleared_at
      when excluded.cleared_at is null then public.notification_center_state.cleared_at
      else greatest(public.notification_center_state.cleared_at, excluded.cleared_at)
    end,
    last_opened_at = case
      when public.notification_center_state.last_opened_at is null then excluded.last_opened_at
      when excluded.last_opened_at is null then public.notification_center_state.last_opened_at
      else greatest(public.notification_center_state.last_opened_at, excluded.last_opened_at)
    end,
    updated_at = server_now
  returning * into state_row;

  insert into public.notification_dismissals (user_id, notification_key, dismissed_at)
  select uid, entry.key, least(entry.value::timestamptz, server_now)
  from jsonb_each_text(p_dismissals) entry
  where length(entry.key) between 1 and 500
  on conflict (user_id, notification_key) do update
  set dismissed_at = greatest(public.notification_dismissals.dismissed_at, excluded.dismissed_at);

  return to_jsonb(state_row) || jsonb_build_object('server_now', server_now);
end;
$$;

create or replace function public.mark_notification_center_opened(p_opened_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  server_now timestamptz := clock_timestamp();
  state_row public.notification_center_state%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':notification-center', 0));
  insert into public.notification_center_state (user_id, last_opened_at, updated_at)
  values (uid, server_now, server_now)
  on conflict (user_id) do update set
    last_opened_at = greatest(public.notification_center_state.last_opened_at, excluded.last_opened_at),
    updated_at = server_now
  returning * into state_row;
  return to_jsonb(state_row) || jsonb_build_object('server_now', server_now);
end;
$$;

create or replace function public.dismiss_notification(
  p_notification_key text,
  p_dismissed_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  server_now timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_notification_key) not between 1 and 500 then
    raise exception 'Invalid notification key';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':notification-center', 0));
  insert into public.notification_dismissals (user_id, notification_key, dismissed_at)
  values (uid, p_notification_key, server_now)
  on conflict (user_id, notification_key) do update
  set dismissed_at = greatest(public.notification_dismissals.dismissed_at, excluded.dismissed_at);
  return jsonb_build_object(
    'notification_key', p_notification_key,
    'dismissed_at', server_now,
    'server_now', server_now
  );
end;
$$;

create or replace function public.clear_notification_history(p_cleared_at timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  server_now timestamptz := clock_timestamp();
  state_row public.notification_center_state%rowtype;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text || ':notification-center', 0));
  insert into public.notification_center_state (user_id, cleared_at, updated_at)
  values (uid, server_now, server_now)
  on conflict (user_id) do update set
    cleared_at = greatest(public.notification_center_state.cleared_at, excluded.cleared_at),
    updated_at = server_now
  returning * into state_row;
  delete from public.notification_dismissals where user_id = uid;
  return to_jsonb(state_row) || jsonb_build_object('server_now', server_now);
end;
$$;

revoke all on function public.sync_notification_center_state(timestamptz, timestamptz, jsonb)
  from public, anon;
revoke all on function public.mark_notification_center_opened(timestamptz)
  from public, anon;
revoke all on function public.dismiss_notification(text, timestamptz)
  from public, anon;
revoke all on function public.clear_notification_history(timestamptz)
  from public, anon;
grant execute on function public.sync_notification_center_state(timestamptz, timestamptz, jsonb)
  to authenticated;
grant execute on function public.mark_notification_center_opened(timestamptz)
  to authenticated;
grant execute on function public.dismiss_notification(text, timestamptz)
  to authenticated;
grant execute on function public.clear_notification_history(timestamptz)
  to authenticated;
