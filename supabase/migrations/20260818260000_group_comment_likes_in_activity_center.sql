-- One durable Activity Center card per liked comment. New likes advance
-- sortAt, so a previously dismissed group becomes visible again only for new
-- activity after the dismissal timestamp.

alter function public.get_notification_center_snapshot(timestamptz, integer)
  rename to get_notification_center_snapshot_ungrouped;

revoke all on function public.get_notification_center_snapshot_ungrouped(timestamptz, integer)
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
    select item
    from jsonb_array_elements(
      public.get_notification_center_snapshot_ungrouped(p_since, 250)
    ) item
  ), ranked_likes as (
    select item,
      row_number() over (
        partition by item ->> 'comment_id'
        order by (item ->> 'sortAt')::timestamptz desc
      ) actor_rank
    from raw
    where item ->> 'kind' = 'comment_like'
  ), grouped as (
    select item from raw where item ->> 'kind' <> 'comment_like'
    union all
    select jsonb_build_object(
      'key', 'comment_likes:' || (likes.item ->> 'comment_id'),
      'kind', 'comment_likes_group',
      'post_id', min(likes.item ->> 'post_id'),
      'comment_id', likes.item ->> 'comment_id',
      'count', count(*)::integer,
      'actors', jsonb_agg(likes.item -> 'actor'
        order by (likes.item ->> 'sortAt')::timestamptz desc)
        filter (where likes.actor_rank <= 8),
      'sortAt', max(likes.item ->> 'sortAt')
    )
    from ranked_likes likes
    group by likes.item ->> 'comment_id'
  )
  select coalesce(jsonb_agg(item order by
    case when item ->> 'kind' = 'friend_request' then 0 else 1 end,
    (item ->> 'sortAt')::timestamptz desc), '[]'::jsonb)
  from (
    select item from grouped
    order by case when item ->> 'kind' = 'friend_request' then 0 else 1 end,
      (item ->> 'sortAt')::timestamptz desc
    limit least(greatest(p_limit, 1), 250)
  ) bounded;
$$;

revoke all on function public.get_notification_center_snapshot(timestamptz, integer)
  from public, anon;
grant execute on function public.get_notification_center_snapshot(timestamptz, integer)
  to authenticated;
