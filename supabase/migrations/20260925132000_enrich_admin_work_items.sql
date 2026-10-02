-- Preserve queue-specific context in the bounded command-center work items so
-- every review surface can show the exact submission rather than generic copy.

alter function public.get_admin_command_center_snapshot_v2(integer)
  rename to get_admin_command_center_snapshot_v2_before_work_item_context_20260925;

revoke all on function public.get_admin_command_center_snapshot_v2_before_work_item_context_20260925(integer)
  from public, anon, authenticated;

create function public.get_admin_command_center_snapshot_v2(
  p_limit integer default 20
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base jsonb;
  patched_work jsonb;
begin
  base := public.get_admin_command_center_snapshot_v2_before_work_item_context_20260925(p_limit);

  select coalesce(jsonb_agg(
    case when item ->> 'queue' = 'suggestions' and suggestion.id is not null then
      item || jsonb_build_object(
        'options', coalesce(suggestion.options, '[]'::jsonb),
        'submitted_by', jsonb_build_object(
          'id', submitter.id,
          'username', submitter.username,
          'display_name', submitter.display_name
        )
      )
    else item end
    order by item_ordinal
  ), '[]'::jsonb)
  into patched_work
  from jsonb_array_elements(coalesce(base -> 'work_items', '[]'::jsonb))
    with ordinality as work(item, item_ordinal)
  left join public.challenge_suggestions suggestion
    on item ->> 'queue' = 'suggestions'
   and suggestion.id::text = item ->> 'id'
  left join public.profiles submitter on submitter.id = suggestion.user_id;

  return jsonb_set(base, '{work_items}', patched_work, true);
end;
$$;

revoke all on function public.get_admin_command_center_snapshot_v2(integer)
  from public, anon;
grant execute on function public.get_admin_command_center_snapshot_v2(integer)
  to authenticated;

comment on function public.get_admin_command_center_snapshot_v2(integer) is
  'Returns bounded active admin work with queue-specific review context, distinct deadline/restricted counts, and explicit safe identities.';
