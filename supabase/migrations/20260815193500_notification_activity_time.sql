-- A pre-live challenge appears when pre-live begins, not at its future fire time.
-- Preserve the bounded snapshot implementation and normalize that one activity
-- timestamp at the public RPC boundary.

alter function public.get_notification_center_snapshot(timestamptz, integer)
  rename to get_notification_center_snapshot_base;

revoke all on function public.get_notification_center_snapshot_base(timestamptz, integer)
  from public, anon, authenticated;

create function public.get_notification_center_snapshot(
  p_since timestamptz,
  p_limit integer default 200
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with normalized as (
    select case
      when item ->> 'kind' = 'challenge' then
        jsonb_set(
          item,
          '{sortAt}',
          to_jsonb(coalesce(
            item #>> '{userEvent,daily_event,prelive_at}',
            item #>> '{userEvent,daily_event,activated_at}',
            item ->> 'sortAt'
          )),
          true
        )
      else item
    end item
    from jsonb_array_elements(
      public.get_notification_center_snapshot_base(p_since, p_limit)
    ) item
  )
  select coalesce(
    jsonb_agg(item order by
      case when item ->> 'kind' = 'friend_request' then 0 else 1 end,
      (item ->> 'sortAt')::timestamptz desc
    ),
    '[]'::jsonb
  )
  from normalized;
$$;

revoke all on function public.get_notification_center_snapshot(timestamptz, integer)
  from public, anon;
grant execute on function public.get_notification_center_snapshot(timestamptz, integer)
  to authenticated;
