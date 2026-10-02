-- Bounded, keyset-paged audit access for the private operator portal.
-- The browser receives only explicit safe actor fields plus the immutable event
-- payload; consumer profile rows remain behind their existing safe contract.

create or replace function public.get_admin_audit_page_v1(
  p_limit integer default 50,
  p_before_occurred_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('operations.read') then
    raise exception 'Administrator access required';
  end if;
  if (p_before_occurred_at is null) <> (p_before_id is null) then
    raise exception 'Audit cursor is incomplete';
  end if;

  with page as (
    select
      audit.id,
      audit.occurred_at,
      audit.actor_role,
      audit.action,
      audit.entity_type,
      audit.entity_id,
      audit.reason,
      audit.request_id,
      audit.metadata,
      profile.id as actor_id,
      profile.username as actor_username,
      profile.display_name as actor_display_name,
      case
        when audit.action like '%evidence_viewed%' then 'access'
        when audit.actor_id is null then 'system'
        else 'decision'
      end as category
    from public.admin_audit_log audit
    left join public.profiles profile on profile.id = audit.actor_id
    where p_before_occurred_at is null
       or (audit.occurred_at, audit.id) < (p_before_occurred_at, p_before_id)
    order by audit.occurred_at desc, audit.id desc
    limit bounded_limit
  ), payload as (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', page.id,
      'occurred_at', page.occurred_at,
      'actor', case when page.actor_id is null then null else jsonb_build_object(
        'id', page.actor_id,
        'username', page.actor_username,
        'display_name', page.actor_display_name
      ) end,
      'actor_role', page.actor_role,
      'action', page.action,
      'entity_type', page.entity_type,
      'entity_id', page.entity_id,
      'reason', page.reason,
      'request_id', page.request_id,
      'metadata', page.metadata,
      'category', page.category
    ) order by page.occurred_at desc, page.id desc), '[]'::jsonb) as items,
      count(*)::integer as item_count
    from page
  ), last_row as (
    select page.occurred_at, page.id
    from page
    order by page.occurred_at asc, page.id asc
    limit 1
  )
  select jsonb_build_object(
    'items', payload.items,
    'next_cursor', case when payload.item_count = bounded_limit then (
      select jsonb_build_object(
        'occurred_at', last_row.occurred_at,
        'id', last_row.id
      ) from last_row
    ) else null end
  )
  into result
  from payload;

  return result;
end;
$$;

revoke all on function public.get_admin_audit_page_v1(integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_admin_audit_page_v1(integer, timestamptz, uuid)
  to authenticated;

comment on function public.get_admin_audit_page_v1(integer, timestamptz, uuid) is
  'Returns a bounded AAL2-authorized immutable audit page with explicit safe actor identity fields.';
