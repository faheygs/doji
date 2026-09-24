-- Production read foundation for the private Doji operator portal.
--
-- The portal receives bounded metadata only. Evidence and every mutation remain
-- behind their existing/narrow command contracts. AAL2 is mandatory even for
-- read access so a stolen password cannot expose operational data.

create table if not exists public.admin_operator_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (
    role in (
      'super_admin',
      'operations',
      'moderator',
      'legal_reviewer',
      'business_reviewer'
    )
  ),
  granted_at timestamptz not null default clock_timestamp(),
  granted_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  primary key (user_id, role)
);

create index if not exists admin_operator_roles_active_user_idx
  on public.admin_operator_roles (user_id, role)
  where revoked_at is null;

alter table public.admin_operator_roles enable row level security;
revoke all on table public.admin_operator_roles from public, anon, authenticated;

-- Preserve the existing administrator contract while role provisioning moves to
-- the portal. This insert is idempotent and does not grant access to a new user.
insert into public.admin_operator_roles (user_id, role)
select profile.id, 'super_admin'
from public.profiles profile
where profile.is_admin is true
on conflict (user_id, role) do nothing;

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default clock_timestamp(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  action text not null check (char_length(action) between 1 and 120),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text not null check (char_length(entity_id) between 1 and 160),
  reason text check (reason is null or char_length(reason) between 1 and 1000),
  request_id text check (request_id is null or char_length(request_id) between 1 and 160),
  metadata jsonb not null default '{}'::jsonb,
  constraint admin_audit_log_metadata_object
    check (jsonb_typeof(metadata) = 'object')
);

create unique index if not exists admin_audit_log_request_action_key
  on public.admin_audit_log (request_id, action)
  where request_id is not null;
create index if not exists admin_audit_log_occurred_at_idx
  on public.admin_audit_log (occurred_at desc, id desc);
create index if not exists reports_pending_created_portal_idx
  on public.reports (created_at, id)
  where status = 'pending';
create index if not exists suggestions_pending_created_portal_idx
  on public.challenge_suggestions (created_at, id)
  where status = 'pending';

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;

create or replace function public.admin_user_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.profiles profile
    where profile.id = auth.uid()
      and profile.is_banned is false
      and (
        profile.is_admin is true
        or exists (
          select 1
          from public.admin_operator_roles membership
          where membership.user_id = profile.id
            and membership.revoked_at is null
            and (
              membership.role = 'super_admin'
              or p_permission = 'portal.session'
              or (p_permission = 'operations.read' and membership.role = 'operations')
              or (p_permission = 'moderation.read' and membership.role in ('operations', 'moderator'))
              or (p_permission = 'legal.read' and membership.role in ('operations', 'legal_reviewer'))
              or (p_permission = 'business.read' and membership.role in ('operations', 'business_reviewer'))
            )
        )
      )
  );
$$;

revoke all on function public.admin_user_has_permission(text) from public, anon;
grant execute on function public.admin_user_has_permission(text) to authenticated;

create or replace function public.get_realtime_token_capabilities(
  p_post_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  requested_count integer := coalesce(cardinality(p_post_ids), 0);
  can_read_moderation boolean := false;
  authorized_post_ids jsonb := '[]'::jsonb;
begin
  if uid is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;
  if requested_count > 64 then
    raise exception 'Too many realtime post subscriptions' using errcode = '22023';
  end if;

  can_read_moderation := public.admin_user_has_permission('moderation.read');

  if requested_count > 0 then
    select coalesce(jsonb_agg(visible.id order by visible.id), '[]'::jsonb)
    into authorized_post_ids
    from (
      select distinct post_id as id
      from unnest(p_post_ids) post_id
      where post_id is not null
        and public.can_view_full_post(post_id, uid)
    ) visible;
  end if;

  return jsonb_build_object(
    'userId', uid,
    'isAdmin', can_read_moderation,
    'authorizedPostIds', authorized_post_ids
  );
end;
$$;

revoke all on function public.get_realtime_token_capabilities(uuid[])
  from public, anon;
grant execute on function public.get_realtime_token_capabilities(uuid[])
  to authenticated;

create or replace function public.publish_admin_suggestion_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  suggestion_id uuid := coalesce(new.id, old.id);
begin
  perform public.enqueue_domain_event(
    'moderation:global',
    'moderation.suggestion.' || lower(tg_op),
    suggestion_id,
    jsonb_build_object('version', 1, 'suggestionId', suggestion_id),
    null
  );
  return coalesce(new, old);
end;
$$;

revoke all on function public.publish_admin_suggestion_change()
  from public, anon, authenticated;

drop trigger if exists publish_admin_suggestion_change
  on public.challenge_suggestions;
create trigger publish_admin_suggestion_change
after insert or update on public.challenge_suggestions
for each row execute function public.publish_admin_suggestion_change();

create or replace function public.get_admin_portal_session()
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
  if not public.admin_user_has_permission('portal.session') then
    raise exception 'Administrator access required';
  end if;

  select jsonb_build_object(
    'user_id', profile.id,
    'username', profile.username,
    'display_name', profile.display_name,
    'avatar_url', profile.avatar_url,
    'roles', case
      when profile.is_admin is true then
        coalesce(
          (
            select jsonb_agg(membership.role order by membership.role)
            from public.admin_operator_roles membership
            where membership.user_id = profile.id and membership.revoked_at is null
          ),
          '["super_admin"]'::jsonb
        )
      else coalesce(
        (
          select jsonb_agg(membership.role order by membership.role)
          from public.admin_operator_roles membership
          where membership.user_id = profile.id and membership.revoked_at is null
        ),
        '[]'::jsonb
      )
    end,
    'aal', auth.jwt() ->> 'aal',
    'read_only', true,
    'server_time', clock_timestamp()
  )
  into result
  from public.profiles profile
  where profile.id = auth.uid();

  return result;
end;
$$;

revoke all on function public.get_admin_portal_session() from public, anon;
grant execute on function public.get_admin_portal_session() to authenticated;

create or replace function public.get_admin_command_center_snapshot(
  p_limit integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  bounded_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('operations.read') then
    raise exception 'Administrator access required';
  end if;

  with report_counts as (
    select
      count(*) filter (where report.status = 'pending')::integer as pending,
      count(*) filter (
        where report.status = 'pending'
          and report.created_at <= clock_timestamp() - interval '20 hours'
      )::integer as nearing_target
    from public.reports report
  ), suggestion_counts as (
    select count(*) filter (where suggestion.status = 'pending')::integer as pending
    from public.challenge_suggestions suggestion
  ), platform_health as (
    select
      count(*) filter (
        where event.published_at is null
          and coalesce(event.available_at, event.created_at)
            < clock_timestamp() - interval '60 seconds'
      )::integer as outbox_overdue,
      coalesce(
        percentile_cont(0.95) within group (
          order by extract(
            epoch from event.realtime_published_at
              - greatest(event.created_at, event.available_at)
          ) * 1000
        ) filter (
          where event.realtime_published_at > clock_timestamp() - interval '5 minutes'
        ),
        0
      )::integer as realtime_p95_ms
    from public.domain_event_outbox event
  ), push_health as (
    select count(*) filter (
      where shard.status in ('pending', 'processing')
        and shard.updated_at < clock_timestamp() - interval '60 seconds'
    )::integer as stale_shards
    from public.push_fanout_shards shard
    join public.daily_events event on event.id = shard.daily_event_id
    where event.activated_at > clock_timestamp() - interval '1 day'
  ), pending_work as (
    select
      report.id::text as id,
      'moderation'::text as queue,
      case
        when report.post_id is not null then 'Post report'
        when report.comment_id is not null then 'Comment report'
        when report.poll_vote_id is not null then 'Poll response report'
        else 'Account or profile report'
      end as subject,
      initcap(replace(report.reason, '_', ' ')) as secondary,
      initcap(replace(report.reason, '_', ' ')) as category,
      report.created_at as submitted_at,
      report.created_at + interval '24 hours' as deadline_at,
      'open'::text as status,
      'Pending'::text as label,
      case
        when report.created_at <= clock_timestamp() - interval '20 hours' then 'high'
        else 'normal'
      end::text as priority,
      'Explicit in-app report awaiting review.'::text as summary,
      'Bounded metadata only'::text as visibility,
      'Unassigned'::text as owner,
      'In-app report'::text as source,
      'Review the authorized evidence and record a policy decision.'::text as next_step,
      jsonb_build_array('Report received') as history,
      report.created_at as sort_at
    from public.reports report
    where report.status = 'pending'

    union all

    select
      suggestion.id::text as id,
      'suggestions'::text as queue,
      left(suggestion.body, 240) as subject,
      case suggestion.kind
        when 'wyr' then 'Would You Rather'
        when 'photo_idea' then 'Photo idea'
        else initcap(replace(suggestion.kind, '_', ' '))
      end as secondary,
      case suggestion.kind
        when 'wyr' then 'Would You Rather'
        when 'photo_idea' then 'Photo idea'
        else initcap(replace(suggestion.kind, '_', ' '))
      end as category,
      suggestion.created_at as submitted_at,
      null::timestamptz as deadline_at,
      'open'::text as status,
      'Pending'::text as label,
      'normal'::text as priority,
      'Community-submitted Doji idea awaiting editorial review.'::text as summary,
      'Not published'::text as visibility,
      'Unassigned'::text as owner,
      'Community suggestion'::text as source,
      'Review originality, safety, clarity, and participation potential.'::text as next_step,
      jsonb_build_array('Suggestion submitted') as history,
      suggestion.created_at as sort_at
    from public.challenge_suggestions suggestion
    where suggestion.status = 'pending'
  ), bounded_work as (
    select work.*
    from pending_work work
    order by
      case work.priority when 'critical' then 0 when 'high' then 1 else 2 end,
      work.sort_at,
      work.id
    limit bounded_limit
  ), next_event as (
    select event.id, event.fires_at, event.prelive_at, event.activated_at,
      event.closes_at, challenge.title
    from public.daily_events event
    join public.challenges challenge on challenge.id = event.challenge_id
    where coalesce(event.closes_at, event.fires_at + interval '10 minutes')
      >= clock_timestamp() - interval '1 hour'
    order by event.fires_at
    limit 1
  )
  select jsonb_build_object(
    'version', 1,
    'generated_at', clock_timestamp(),
    'read_only', true,
    'metrics', jsonb_build_object(
      'urgent_deadlines', report_counts.nearing_target,
      'unassigned_work', report_counts.pending + suggestion_counts.pending,
      'sponsored_reviews', 0,
      'open_reports', report_counts.pending,
      'pending_suggestions', suggestion_counts.pending
    ),
    'platform', jsonb_build_object(
      'healthy', platform_health.outbox_overdue = 0
        and push_health.stale_shards = 0
        and platform_health.realtime_p95_ms <= 5000,
      'outbox_overdue', platform_health.outbox_overdue,
      'push_stale_shards', push_health.stale_shards,
      'realtime_p95_ms_5m', platform_health.realtime_p95_ms
    ),
    'queue_health', jsonb_build_array(
      jsonb_build_object(
        'key', 'moderation',
        'label', 'Trust & safety',
        'count', report_counts.pending,
        'note', case when report_counts.nearing_target > 0
          then report_counts.nearing_target || ' nearing the 24-hour target'
          else 'All inside the internal target' end
      ),
      jsonb_build_object(
        'key', 'suggestions',
        'label', 'Community ideas',
        'count', suggestion_counts.pending,
        'note', 'Bounded editorial queue'
      )
    ),
    'work_items', coalesce(
      (
        select jsonb_agg(
          to_jsonb(work) - 'sort_at'
          order by case work.priority when 'critical' then 0 when 'high' then 1 else 2 end,
            work.sort_at, work.id
        )
        from bounded_work work
      ),
      '[]'::jsonb
    ),
    'next_event', (
      select to_jsonb(event) from next_event event
    ),
    'release_policies', coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'platform', policy.platform,
          'latest_version', policy.latest_version,
          'latest_build', policy.latest_build,
          'minimum_version', policy.minimum_version,
          'minimum_build', policy.minimum_build,
          'enabled', policy.enabled,
          'updated_at', policy.updated_at
        ) order by policy.platform)
        from public.mobile_release_policy policy
      ),
      '[]'::jsonb
    ),
    'announcements', coalesce(
      (
        select jsonb_agg(to_jsonb(announcement) order by announcement.created_at desc)
        from (
          select item.id, item.title, item.body, item.cta_label, item.cta_url,
            item.starts_at, item.ends_at, item.enabled, item.priority,
            item.max_impressions_per_user, item.min_hours_between_impressions,
            item.created_at, item.updated_at
          from public.app_announcements item
          order by item.created_at desc
          limit 20
        ) announcement
      ),
      '[]'::jsonb
    ),
    'recent_audit', coalesce(
      (
        select jsonb_agg(to_jsonb(audit) order by audit.occurred_at desc, audit.id desc)
        from (
          select entry.id, entry.occurred_at, entry.actor_id, entry.actor_role,
            entry.action, entry.entity_type, entry.entity_id, entry.reason
          from public.admin_audit_log entry
          order by entry.occurred_at desc, entry.id desc
          limit 20
        ) audit
      ),
      '[]'::jsonb
    )
  )
  into result
  from report_counts cross join suggestion_counts cross join platform_health cross join push_health;

  return result;
end;
$$;

revoke all on function public.get_admin_command_center_snapshot(integer)
  from public, anon;
grant execute on function public.get_admin_command_center_snapshot(integer)
  to authenticated;

comment on function public.get_admin_portal_session() is
  'Returns the current AAL2 operator identity and active portal roles without exposing account-private fields.';
comment on function public.get_admin_command_center_snapshot(integer) is
  'Returns bounded, read-only admin command-center metadata for existing production domains.';
