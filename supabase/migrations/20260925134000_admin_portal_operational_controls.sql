-- Complete the production portal's audit browsing and operator-access contracts.
-- Every read remains bounded and AAL2 authorized. Operator mutations are
-- super-admin-only, idempotent, immediately effective on the next portal request,
-- and append-only audited.

create or replace function public.get_admin_audit_page_v2(
  p_limit integer default 50,
  p_before_occurred_at timestamptz default null,
  p_before_id uuid default null,
  p_category text default 'activity',
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 50), 1), 100);
  normalized_category text := lower(btrim(coalesce(p_category, 'activity')));
  normalized_search text := lower(btrim(coalesce(p_search, '')));
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
  if normalized_category not in ('activity', 'all', 'decision', 'access', 'system') then
    raise exception 'Invalid audit category';
  end if;
  if char_length(normalized_search) > 160 then
    raise exception 'Audit search is too long';
  end if;

  with filtered as (
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
    where (
      p_before_occurred_at is null
      or (audit.occurred_at, audit.id) < (p_before_occurred_at, p_before_id)
    )
      and (
        normalized_category = 'all'
        or (normalized_category = 'activity' and audit.action not like '%evidence_viewed%')
        or (normalized_category = 'access' and audit.action like '%evidence_viewed%')
        or (normalized_category = 'system' and audit.actor_id is null)
        or (
          normalized_category = 'decision'
          and audit.actor_id is not null
          and audit.action not like '%evidence_viewed%'
        )
      )
      and (
        normalized_search = ''
        or lower(audit.action) like '%' || normalized_search || '%'
        or lower(audit.entity_type) like '%' || normalized_search || '%'
        or lower(audit.entity_id) like '%' || normalized_search || '%'
        or lower(coalesce(audit.reason, '')) like '%' || normalized_search || '%'
        or lower(coalesce(audit.request_id, '')) like '%' || normalized_search || '%'
        or lower(coalesce(profile.username, '')) like '%' || normalized_search || '%'
        or lower(coalesce(profile.display_name, '')) like '%' || normalized_search || '%'
      )
    order by audit.occurred_at desc, audit.id desc
    limit bounded_limit
  ), payload as (
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'id', filtered.id,
        'occurred_at', filtered.occurred_at,
        'actor', case when filtered.actor_id is null then null else jsonb_build_object(
          'id', filtered.actor_id,
          'username', filtered.actor_username,
          'display_name', filtered.actor_display_name
        ) end,
        'actor_role', filtered.actor_role,
        'action', filtered.action,
        'entity_type', filtered.entity_type,
        'entity_id', filtered.entity_id,
        'reason', filtered.reason,
        'request_id', filtered.request_id,
        'metadata', filtered.metadata,
        'category', filtered.category
      ) order by filtered.occurred_at desc, filtered.id desc), '[]'::jsonb) as items,
      count(*)::integer as item_count
    from filtered
  ), last_row as (
    select filtered.occurred_at, filtered.id
    from filtered
    order by filtered.occurred_at asc, filtered.id asc
    limit 1
  )
  select jsonb_build_object(
    'items', payload.items,
    'filter', normalized_category,
    'search', nullif(normalized_search, ''),
    'next_cursor', case when payload.item_count = bounded_limit then (
      select jsonb_build_object('occurred_at', last_row.occurred_at, 'id', last_row.id)
      from last_row
    ) else null end
  )
  into result
  from payload;

  return result;
end;
$$;

revoke all on function public.get_admin_audit_page_v2(integer, timestamptz, uuid, text, text)
  from public, anon;
grant execute on function public.get_admin_audit_page_v2(integer, timestamptz, uuid, text, text)
  to authenticated;

create or replace function public.get_admin_audit_export_v1(
  p_category text default 'activity',
  p_search text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized_category text := lower(btrim(coalesce(p_category, 'activity')));
  normalized_search text := lower(btrim(coalesce(p_search, '')));
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('operations.read') then
    raise exception 'Administrator access required';
  end if;
  if normalized_category not in ('activity', 'all', 'decision', 'access', 'system') then
    raise exception 'Invalid audit category';
  end if;
  if char_length(normalized_search) > 160 then
    raise exception 'Audit search is too long';
  end if;

  with filtered as (
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
    where (
      normalized_category = 'all'
      or (normalized_category = 'activity' and audit.action not like '%evidence_viewed%')
      or (normalized_category = 'access' and audit.action like '%evidence_viewed%')
      or (normalized_category = 'system' and audit.actor_id is null)
      or (
        normalized_category = 'decision'
        and audit.actor_id is not null
        and audit.action not like '%evidence_viewed%'
      )
    )
      and (
        normalized_search = ''
        or lower(audit.action) like '%' || normalized_search || '%'
        or lower(audit.entity_type) like '%' || normalized_search || '%'
        or lower(audit.entity_id) like '%' || normalized_search || '%'
        or lower(coalesce(audit.reason, '')) like '%' || normalized_search || '%'
        or lower(coalesce(audit.request_id, '')) like '%' || normalized_search || '%'
        or lower(coalesce(profile.username, '')) like '%' || normalized_search || '%'
        or lower(coalesce(profile.display_name, '')) like '%' || normalized_search || '%'
      )
    order by audit.occurred_at desc, audit.id desc
    limit 5001
  ), bounded as (
    select * from filtered
    order by occurred_at desc, id desc
    limit 5000
  )
  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', bounded.id,
      'occurred_at', bounded.occurred_at,
      'actor', case when bounded.actor_id is null then null else jsonb_build_object(
        'id', bounded.actor_id,
        'username', bounded.actor_username,
        'display_name', bounded.actor_display_name
      ) end,
      'actor_role', bounded.actor_role,
      'action', bounded.action,
      'entity_type', bounded.entity_type,
      'entity_id', bounded.entity_id,
      'reason', bounded.reason,
      'request_id', bounded.request_id,
      'metadata', bounded.metadata,
      'category', bounded.category
    ) order by bounded.occurred_at desc, bounded.id desc), '[]'::jsonb),
    'truncated', (select count(*) > 5000 from filtered),
    'maximum', 5000
  )
  into result
  from bounded;

  return result;
end;
$$;

revoke all on function public.get_admin_audit_export_v1(text, text) from public, anon;
grant execute on function public.get_admin_audit_export_v1(text, text) to authenticated;

create or replace function public.get_admin_operator_directory_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('admin.manage') then
    raise exception 'Super administrator access required';
  end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'user_id', operator.id,
      'username', operator.username,
      'display_name', operator.display_name,
      'avatar_url', operator.avatar_url,
      'is_founder_admin', operator.is_admin,
      'is_banned', operator.is_banned,
      'roles', operator.roles,
      'first_granted_at', operator.first_granted_at,
      'last_changed_at', operator.last_changed_at
    ) order by operator.is_admin desc, lower(coalesce(operator.display_name, operator.username))), '[]'::jsonb),
    'available_roles', jsonb_build_array(
      jsonb_build_object('code', 'super_admin', 'label', 'Super admin'),
      jsonb_build_object('code', 'operations', 'label', 'Operations'),
      jsonb_build_object('code', 'moderator', 'label', 'Moderator'),
      jsonb_build_object('code', 'legal_reviewer', 'label', 'Restricted-safety reviewer'),
      jsonb_build_object('code', 'business_reviewer', 'label', 'Business reviewer')
    )
  )
  into result
  from (
    select
      profile.id,
      profile.username,
      profile.display_name,
      profile.avatar_url,
      profile.is_admin,
      profile.is_banned,
      case when profile.is_admin then
        (select jsonb_agg(distinct role_name order by role_name)
         from (
           select 'super_admin'::text as role_name
           union all
           select membership.role
           from public.admin_operator_roles membership
           where membership.user_id = profile.id and membership.revoked_at is null
         ) roles)
      else coalesce((
        select jsonb_agg(membership.role order by membership.role)
        from public.admin_operator_roles membership
        where membership.user_id = profile.id and membership.revoked_at is null
      ), '[]'::jsonb) end as roles,
      (select min(membership.granted_at) from public.admin_operator_roles membership
       where membership.user_id = profile.id) as first_granted_at,
      (select max(greatest(membership.granted_at, coalesce(membership.revoked_at, membership.granted_at)))
       from public.admin_operator_roles membership where membership.user_id = profile.id) as last_changed_at
    from public.profiles profile
    where profile.is_admin is true
       or exists (
         select 1 from public.admin_operator_roles membership
         where membership.user_id = profile.id and membership.revoked_at is null
       )
  ) operator;

  return result;
end;
$$;

revoke all on function public.get_admin_operator_directory_v1() from public, anon;
grant execute on function public.get_admin_operator_directory_v1() to authenticated;

create or replace function public.admin_set_operator_role_v1(
  p_username text,
  p_role text,
  p_active boolean,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target public.profiles%rowtype;
  normalized_role text := lower(btrim(coalesce(p_role, '')));
  normalized_reason text := btrim(coalesce(p_reason, ''));
  audit_action text := case when p_active then 'operator.role_granted' else 'operator.role_revoked' end;
  remaining_super_admins integer;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('admin.manage') then
    raise exception 'Super administrator access required';
  end if;
  if normalized_role not in ('super_admin', 'operations', 'moderator', 'legal_reviewer', 'business_reviewer') then
    raise exception 'Choose a valid administrator role';
  end if;
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception 'Access-change reason must be between 10 and 1000 characters';
  end if;
  if char_length(btrim(coalesce(p_idempotency_key, ''))) not between 12 and 160 then
    raise exception 'Invalid idempotency key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(actor_id::text || ':' || p_idempotency_key, 0)
  );

  select * into target
  from public.profiles profile
  where lower(profile.username) = lower(btrim(coalesce(p_username, '')))
  for update;

  if target.id is null then raise exception 'Doji account not found'; end if;
  if target.is_banned then raise exception 'A banned account cannot receive administrator access'; end if;

  if exists (
    select 1 from public.admin_audit_log audit
    where audit.request_id = p_idempotency_key and audit.action = audit_action
  ) then
    return jsonb_build_object(
      'user_id', target.id,
      'username', target.username,
      'role', normalized_role,
      'active', p_active,
      'replayed', true
    );
  end if;

  if not p_active and normalized_role = 'super_admin' then
    if target.is_admin then
      raise exception 'The founder administrator cannot be removed through this role control';
    end if;
    select count(distinct administrator.user_id)::integer into remaining_super_admins
    from (
      select profile.id as user_id from public.profiles profile
      where profile.is_admin is true and profile.is_banned is false
      union
      select membership.user_id
      from public.admin_operator_roles membership
      join public.profiles profile on profile.id = membership.user_id
      where membership.role = 'super_admin'
        and membership.revoked_at is null
        and profile.is_banned is false
        and membership.user_id <> target.id
    ) administrator;
    if remaining_super_admins < 1 then
      raise exception 'At least one active super administrator is required';
    end if;
  end if;

  if p_active then
    insert into public.admin_operator_roles (user_id, role, granted_at, granted_by, revoked_at)
    values (target.id, normalized_role, clock_timestamp(), actor_id, null)
    on conflict (user_id, role) do update
      set granted_at = excluded.granted_at,
          granted_by = excluded.granted_by,
          revoked_at = null;
  else
    update public.admin_operator_roles
    set revoked_at = clock_timestamp()
    where user_id = target.id and role = normalized_role and revoked_at is null;
  end if;

  insert into public.admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, reason, request_id, metadata
  ) values (
    actor_id,
    public.admin_current_operator_role(),
    audit_action,
    'operator',
    target.id::text,
    normalized_reason,
    p_idempotency_key,
    jsonb_build_object('username', target.username, 'role', normalized_role, 'active', p_active)
  );

  return jsonb_build_object(
    'user_id', target.id,
    'username', target.username,
    'role', normalized_role,
    'active', p_active,
    'replayed', false
  );
end;
$$;

revoke all on function public.admin_set_operator_role_v1(text, text, boolean, text, text)
  from public, anon;
grant execute on function public.admin_set_operator_role_v1(text, text, boolean, text, text)
  to authenticated;

alter function public.get_admin_portal_session_v2()
  rename to get_admin_portal_session_v2_before_access_controls_20260925;

revoke all on function public.get_admin_portal_session_v2_before_access_controls_20260925()
  from public, anon, authenticated;

create function public.get_admin_portal_session_v2()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  base jsonb;
begin
  base := public.get_admin_portal_session_v2_before_access_controls_20260925();
  return jsonb_set(
    base,
    '{capabilities,operator_manage}',
    to_jsonb(public.admin_user_has_permission('admin.manage')),
    true
  );
end;
$$;

revoke all on function public.get_admin_portal_session_v2() from public, anon;
grant execute on function public.get_admin_portal_session_v2() to authenticated;

comment on function public.get_admin_audit_page_v2(integer, timestamptz, uuid, text, text) is
  'Returns a bounded, server-filtered AAL2 audit page; activity excludes repetitive evidence access by default.';
comment on function public.get_admin_audit_export_v1(text, text) is
  'Exports up to 5000 raw immutable audit rows matching the selected server-side view.';
comment on function public.get_admin_operator_directory_v1() is
  'Returns the safe current operator directory to AAL2 super administrators.';
comment on function public.admin_set_operator_role_v1(text, text, boolean, text, text) is
  'Atomically grants or revokes one existing Doji account role with super-admin authority and immutable audit.';
