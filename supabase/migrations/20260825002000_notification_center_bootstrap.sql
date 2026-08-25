-- Hydrate notification state, dismissals, and the bounded activity snapshot in
-- one authenticated round trip.  This removes the cold-open waterfall while
-- retaining the monotonic multi-device merge contract.

create or replace function public.get_notification_center_bootstrap(
  p_local_cleared_at timestamptz,
  p_local_last_opened_at timestamptz,
  p_local_dismissals jsonb default '{}'::jsonb,
  p_limit integer default 200
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  state jsonb;
  dismissals jsonb;
  items jsonb;
  since_at timestamptz;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_limit < 1 or p_limit > 200 then raise exception 'Invalid notification limit'; end if;

  state := public.sync_notification_center_state(
    p_local_cleared_at,
    p_local_last_opened_at,
    coalesce(p_local_dismissals, '{}'::jsonb)
  );
  since_at := greatest(
    coalesce((state ->> 'cleared_at')::timestamptz, '-infinity'::timestamptz),
    clock_timestamp() - interval '30 days'
  );

  select coalesce(jsonb_agg(to_jsonb(dismissal) order by dismissal.dismissed_at desc), '[]'::jsonb)
    into dismissals
  from (
    select row.user_id, row.notification_key, row.dismissed_at
    from public.notification_dismissals row
    where row.user_id = uid and row.dismissed_at >= clock_timestamp() - interval '30 days'
    order by row.dismissed_at desc
    limit 2000
  ) dismissal;

  items := public.get_notification_center_snapshot(since_at, p_limit);
  return jsonb_build_object(
    'server_now', clock_timestamp(),
    'state', state,
    'dismissals', dismissals,
    'items', coalesce(items, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_notification_center_bootstrap(
  timestamptz, timestamptz, jsonb, integer
) from public, anon;
grant execute on function public.get_notification_center_bootstrap(
  timestamptz, timestamptz, jsonb, integer
) to authenticated;
