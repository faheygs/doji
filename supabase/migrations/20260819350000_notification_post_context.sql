-- Preserve post ownership context in the bounded Activity Center snapshot so
-- shared Doji activity never uses individually-owned "your post" copy.

alter function public.get_notification_center_snapshot(timestamptz, integer)
  rename to get_notification_center_snapshot_without_post_context;

revoke all on function public.get_notification_center_snapshot_without_post_context(timestamptz, integer)
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
  with raw as (
    select value as item, ordinality as position
    from jsonb_array_elements(
      public.get_notification_center_snapshot_without_post_context(p_since, p_limit)
    ) with ordinality
  )
  select coalesce(
    jsonb_agg(
      case
        when p.id is not null then
          raw.item || jsonb_build_object(
            'is_shared_post', coalesce(p.is_community_poll, false)
          )
        else raw.item
      end
      order by raw.position
    ),
    '[]'::jsonb
  )
  from raw
  left join public.posts p
    on p.id = nullif(raw.item ->> 'post_id', '')::uuid;
$$;

revoke all on function public.get_notification_center_snapshot(timestamptz, integer)
  from public, anon;
grant execute on function public.get_notification_center_snapshot(timestamptz, integer)
  to authenticated;
