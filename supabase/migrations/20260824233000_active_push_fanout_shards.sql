-- Cloudflare Queue's free allowance is intentionally small and is not a
-- correctness primitive. Return only shards with real eligible recipients so
-- the durable fanout alarm never creates 128 units of work for a six-user app.
create or replace function public.list_doji_push_fanout_shards(
  p_daily_event_id uuid
)
returns smallint[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct profile.push_shard order by profile.push_shard),
                  array[]::smallint[])
  from public.profiles profile
  where coalesce(profile.is_banned, false) = false
    and coalesce((profile.notification_preferences ->> 'push_enabled')::boolean, true)
    and coalesce((profile.notification_preferences ->> 'doji_start')::boolean, true)
    and (
      profile.notification_token is not null
      or exists (
        select 1
        from public.device_push_endpoints endpoint
        where endpoint.user_id = profile.id and endpoint.active = true
      )
    )
    and (
      not exists (
        select 1
        from public.daily_event_audience audience
        where audience.daily_event_id = p_daily_event_id
      )
      or exists (
        select 1
        from public.daily_event_audience audience
        where audience.daily_event_id = p_daily_event_id
          and audience.user_id = profile.id
      )
    );
$$;

revoke all on function public.list_doji_push_fanout_shards(uuid)
  from public, anon, authenticated;
grant execute on function public.list_doji_push_fanout_shards(uuid) to service_role;

comment on function public.list_doji_push_fanout_shards(uuid) is
  'Lists only push partitions containing eligible recipients for one Doji occurrence.';
