-- Pending challenge suggestions are moderation evidence. Read them through one
-- bounded, admin-only snapshot so profile RLS and PostgREST relationship changes
-- cannot break the review queue.
create or replace function public.get_pending_suggestions_snapshot(
  p_limit integer default 100
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_admin is true
  ) then
    raise exception 'Admin access required';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', suggestion.id,
        'user_id', suggestion.user_id,
        'kind', suggestion.kind,
        'body', suggestion.body,
        'body_hash', suggestion.body_hash,
        'options', suggestion.options,
        'status', suggestion.status,
        'admin_note', suggestion.admin_note,
        'selected_at', suggestion.selected_at,
        'reviewed_at', suggestion.reviewed_at,
        'reviewed_by', suggestion.reviewed_by,
        'created_at', suggestion.created_at,
        'profile', jsonb_build_object(
          'id', author.id,
          'username', author.username,
          'display_name', author.display_name,
          'avatar_url', author.avatar_url,
          'equipped_border_key', author.equipped_border_key
        )
      )
      order by suggestion.created_at, suggestion.id
    ),
    '[]'::jsonb
  )
  into result
  from (
    select pending.*
    from public.challenge_suggestions pending
    where pending.status = 'pending'
    order by pending.created_at, pending.id
    limit least(greatest(coalesce(p_limit, 100), 1), 100)
  ) suggestion
  join public.profiles author on author.id = suggestion.user_id;

  return result;
end;
$$;

revoke all on function public.get_pending_suggestions_snapshot(integer) from public, anon;
grant execute on function public.get_pending_suggestions_snapshot(integer) to authenticated;
