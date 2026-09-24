-- First writable administrator-portal workflow: Trust & Safety report triage.
-- Every browser command requires AAL2, a server-owned moderation role, a stable
-- idempotency key, a locked report row, and an append-only audit entry.

create table if not exists public.admin_report_triage (
  report_id uuid primary key references public.reports(id) on delete cascade,
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'critical')),
  assigned_to uuid references public.profiles(id) on delete set null,
  assigned_at timestamptz,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp()
);

create index if not exists admin_report_triage_assigned_idx
  on public.admin_report_triage (assigned_to, priority, updated_at desc);

alter table public.admin_report_triage enable row level security;
revoke all on table public.admin_report_triage from public, anon, authenticated;

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
              or (p_permission in ('moderation.read', 'moderation.write')
                and membership.role in ('operations', 'moderator'))
              or (p_permission = 'legal.read'
                and membership.role in ('operations', 'legal_reviewer'))
              or (p_permission = 'business.read'
                and membership.role in ('operations', 'business_reviewer'))
            )
        )
      )
  );
$$;

revoke all on function public.admin_user_has_permission(text) from public, anon;
grant execute on function public.admin_user_has_permission(text) to authenticated;

create or replace function public.can_read_post_media(
  p_object_path text,
  p_viewer uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.posts post
    where (
        public.public_storage_object_path(post.photo_url, 'post-media') = p_object_path
        or public.public_storage_object_path(post.front_photo_url, 'post-media') = p_object_path
        or public.public_storage_object_path(post.video_url, 'post-media') = p_object_path
      )
      and (
        exists (
          select 1 from public.profiles viewer
          where viewer.id = p_viewer and viewer.is_admin is true
        )
        or public.can_view_full_post(
          p_viewer,
          post.user_event_id,
          post.daily_event_id,
          post.user_id,
          coalesce(post.is_community_poll, false)
        )
        or (
          p_viewer = auth.uid()
          and coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
          and public.admin_user_has_permission('moderation.read')
          and exists (
            select 1
            from public.reports report
            where report.post_id = post.id
              and report.status = 'pending'
          )
        )
      )
  ), false);
$$;

revoke all on function public.can_read_post_media(text, uuid)
  from public, anon;
grant execute on function public.can_read_post_media(text, uuid)
  to authenticated;

create or replace function public.admin_current_operator_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select membership.role
      from public.admin_operator_roles membership
      where membership.user_id = auth.uid()
        and membership.revoked_at is null
      order by case membership.role
        when 'super_admin' then 0
        when 'operations' then 1
        when 'moderator' then 2
        when 'legal_reviewer' then 3
        else 4
      end
      limit 1
    ),
    case when exists (
      select 1 from public.profiles profile
      where profile.id = auth.uid() and profile.is_admin is true
    ) then 'super_admin' end
  );
$$;

revoke all on function public.admin_current_operator_role()
  from public, anon, authenticated;

create or replace function public.get_admin_portal_session_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  base jsonb;
begin
  base := public.get_admin_portal_session();
  return base || jsonb_build_object(
    'version', 2,
    'read_only', false,
    'capabilities', jsonb_build_object(
      'moderation_read', public.admin_user_has_permission('moderation.read'),
      'moderation_write', public.admin_user_has_permission('moderation.write')
    )
  );
end;
$$;

revoke all on function public.get_admin_portal_session_v2()
  from public, anon;
grant execute on function public.get_admin_portal_session_v2()
  to authenticated;

create or replace function public.get_admin_command_center_snapshot_v2(
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
  unassigned_count integer;
begin
  base := public.get_admin_command_center_snapshot(p_limit);

  select coalesce(jsonb_agg(
    case when item ->> 'queue' = 'moderation' then
      item || jsonb_build_object(
        'priority', coalesce(triage.priority, item ->> 'priority'),
        'owner', coalesce(
          nullif(owner.display_name, ''),
          nullif(owner.username, ''),
          'Unassigned'
        ),
        'assigned_to', triage.assigned_to
      )
    else item end
    order by item_ordinal
  ), '[]'::jsonb)
  into patched_work
  from jsonb_array_elements(coalesce(base -> 'work_items', '[]'::jsonb))
    with ordinality as work(item, item_ordinal)
  left join public.admin_report_triage triage
    on item ->> 'queue' = 'moderation'
   and triage.report_id::text = item ->> 'id'
  left join public.profiles owner on owner.id = triage.assigned_to;

  select
    count(*) filter (
      where report.status = 'pending' and triage.assigned_to is null
    )::integer
    + (
      select count(*)::integer
      from public.challenge_suggestions suggestion
      where suggestion.status = 'pending'
    )
  into unassigned_count
  from public.reports report
  left join public.admin_report_triage triage on triage.report_id = report.id;

  return jsonb_set(
    jsonb_set(
      jsonb_set(base, '{version}', '2'::jsonb, true),
      '{work_items}', patched_work, true
    ),
    '{metrics,unassigned_work}', to_jsonb(unassigned_count), true
  );
end;
$$;

revoke all on function public.get_admin_command_center_snapshot_v2(integer)
  from public, anon;
grant execute on function public.get_admin_command_center_snapshot_v2(integer)
  to authenticated;

create or replace function public.get_admin_report_case(p_report_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.read') then
    raise exception 'Moderation access required';
  end if;

  select jsonb_build_object(
    'id', report.id,
    'reason', report.reason,
    'status', report.status,
    'notes', report.notes,
    'created_at', report.created_at,
    'deadline_at', report.created_at + interval '24 hours',
    'priority', coalesce(triage.priority,
      case when report.created_at <= clock_timestamp() - interval '20 hours'
        then 'high' else 'normal' end),
    'assigned_to', triage.assigned_to,
    'assigned_at', triage.assigned_at,
    'owner', case when owner.id is null then null else jsonb_build_object(
      'id', owner.id,
      'username', owner.username,
      'display_name', owner.display_name
    ) end,
    'reporter', case when reporter.id is null then null else jsonb_build_object(
      'id', reporter.id,
      'username', reporter.username,
      'display_name', reporter.display_name
    ) end,
    'reported_user', case when reported.id is null then null else jsonb_build_object(
      'id', reported.id,
      'username', reported.username,
      'display_name', reported.display_name,
      'is_banned', reported.is_banned
    ) end,
    'evidence', case
      when report.post_id is not null then jsonb_build_object(
        'kind', 'post',
        'content_id', report.post_id,
        'exists', post.id is not null,
        'caption', post.caption,
        'has_media', post.photo_url is not null,
        'media_bucket', case when post.photo_url is null then null else 'post-media' end,
        'media_path', public.public_storage_object_path(post.photo_url, 'post-media')
      )
      when report.comment_id is not null then jsonb_build_object(
        'kind', 'comment',
        'content_id', report.comment_id,
        'exists', comment.id is not null,
        'body', comment.body
      )
      when report.poll_vote_id is not null then jsonb_build_object(
        'kind', 'poll_response',
        'content_id', report.poll_vote_id,
        'exists', vote.id is not null,
        'custom_text', vote.custom_text
      )
      else jsonb_build_object(
        'kind', 'account_profile',
        'content_id', report.reported_user_id,
        'exists', reported.id is not null,
        'has_profile_photo', reported.avatar_url is not null,
        'profile_photo_url', reported.avatar_url
      )
    end,
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entry.id,
        'occurred_at', entry.occurred_at,
        'actor_role', entry.actor_role,
        'action', entry.action,
        'reason', entry.reason
      ) order by entry.occurred_at desc, entry.id desc)
      from (
        select audit.*
        from public.admin_audit_log audit
        where audit.entity_type = 'report'
          and audit.entity_id = report.id::text
        order by audit.occurred_at desc, audit.id desc
        limit 50
      ) entry
    ), '[]'::jsonb)
  )
  into result
  from public.reports report
  left join public.admin_report_triage triage on triage.report_id = report.id
  left join public.profiles owner on owner.id = triage.assigned_to
  left join public.profiles reporter on reporter.id = report.reporter_id
  left join public.profiles reported on reported.id = report.reported_user_id
  left join public.posts post on post.id = report.post_id
  left join public.comments comment on comment.id = report.comment_id
  left join public.poll_votes vote on vote.id = report.poll_vote_id
  where report.id = p_report_id;

  if result is null then raise exception 'Report not found'; end if;

  insert into public.admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, metadata
  ) values (
    auth.uid(), public.admin_current_operator_role(), 'report.evidence_viewed',
    'report', p_report_id::text,
    jsonb_build_object('evidenceKind', result #>> '{evidence,kind}')
  );

  return result;
end;
$$;

revoke all on function public.get_admin_report_case(uuid)
  from public, anon;
grant execute on function public.get_admin_report_case(uuid)
  to authenticated;

create or replace function public.admin_triage_report(
  p_report_id uuid,
  p_action text,
  p_priority text,
  p_note text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  report_row public.reports%rowtype;
  triage_row public.admin_report_triage%rowtype;
  prior_result jsonb;
  final_result jsonb;
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
  actor_role text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_action not in ('claim', 'release', 'set_priority', 'escalate') then
    raise exception 'Invalid triage action';
  end if;
  if p_action in ('set_priority', 'escalate')
     and p_priority not in ('low', 'normal', 'high', 'critical') then
    raise exception 'Invalid priority';
  end if;
  if p_action = 'escalate' and normalized_note is null then
    raise exception 'An escalation note is required';
  end if;
  if normalized_note is not null and char_length(normalized_note) > 1000 then
    raise exception 'Triage note is too long';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text, 0));
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into report_row
  from public.reports report
  where report.id = p_report_id
  for update;
  if not found then raise exception 'Report not found'; end if;
  if report_row.status <> 'pending' then raise exception 'Report is already closed'; end if;
  actor_role := public.admin_current_operator_role();

  insert into public.admin_report_triage (report_id)
  values (p_report_id)
  on conflict (report_id) do nothing;

  if p_action = 'claim' then
    update public.admin_report_triage
    set assigned_to = uid,
        assigned_at = coalesce(assigned_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where report_id = p_report_id
      and (assigned_to is null or assigned_to = uid)
    returning * into triage_row;
    if not found then raise exception 'This report is assigned to another operator'; end if;
  elsif p_action = 'release' then
    update public.admin_report_triage
    set assigned_to = null, assigned_at = null, updated_at = clock_timestamp()
    where report_id = p_report_id
      and (assigned_to = uid or actor_role = 'super_admin')
    returning * into triage_row;
    if not found then raise exception 'Only the assigned operator may release this report'; end if;
  elsif p_action = 'set_priority' then
    update public.admin_report_triage
    set priority = p_priority, updated_at = clock_timestamp()
    where report_id = p_report_id
      and (assigned_to is null or assigned_to = uid or actor_role = 'super_admin')
    returning * into triage_row;
    if not found then raise exception 'This report is assigned to another operator'; end if;
  else
    update public.admin_report_triage
    set priority = 'critical',
        assigned_to = coalesce(assigned_to, uid),
        assigned_at = coalesce(assigned_at, clock_timestamp()),
        updated_at = clock_timestamp()
    where report_id = p_report_id
    returning * into triage_row;
  end if;

  insert into public.admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, reason,
    request_id, metadata
  ) values (
    uid, actor_role, 'report.' || p_action, 'report', p_report_id::text,
    normalized_note, p_idempotency_key,
    jsonb_build_object(
      'priority', triage_row.priority,
      'assignedTo', triage_row.assigned_to
    )
  );

  perform public.enqueue_domain_event(
    'moderation:global',
    'moderation.report.triaged',
    p_report_id,
    jsonb_build_object('version', 1, 'reportId', p_report_id),
    null
  );

  final_result := jsonb_build_object(
    'report_id', triage_row.report_id,
    'priority', triage_row.priority,
    'assigned_to', triage_row.assigned_to,
    'assigned_at', triage_row.assigned_at,
    'updated_at', triage_row.updated_at
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.admin_triage_report(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.admin_triage_report(uuid, text, text, text, text)
  to authenticated;

create or replace function public.admin_decide_report(
  p_report_id uuid,
  p_action text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  report_row public.reports%rowtype;
  prior_result jsonb;
  final_result jsonb;
  normalized_reason text := btrim(coalesce(p_reason, ''));
  actor_role text;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' then
    raise exception 'Administrator MFA required';
  end if;
  if not public.admin_user_has_permission('moderation.write') then
    raise exception 'Moderation write access required';
  end if;
  if char_length(coalesce(p_idempotency_key, '')) not between 16 and 160 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_action not in ('dismiss', 'remove_content', 'remove_profile_photo', 'remove_and_ban') then
    raise exception 'Invalid moderation action';
  end if;
  if char_length(normalized_reason) not between 10 and 1000 then
    raise exception 'Enter a decision reason between 10 and 1000 characters';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_report_id::text, 0));
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select * into report_row
  from public.reports report
  where report.id = p_report_id
  for update;
  if not found then raise exception 'Report not found'; end if;
  if report_row.status <> 'pending' then raise exception 'Report is already closed'; end if;
  actor_role := public.admin_current_operator_role();

  insert into public.admin_report_triage (report_id)
  values (p_report_id)
  on conflict (report_id) do nothing;

  if exists (
    select 1
    from public.admin_report_triage triage
    where triage.report_id = p_report_id
      and triage.assigned_to is not null
      and triage.assigned_to <> uid
      and actor_role <> 'super_admin'
  ) then
    raise exception 'This report is assigned to another operator';
  end if;

  if p_action = 'remove_content' then
    if report_row.post_id is null
       and report_row.comment_id is null
       and report_row.poll_vote_id is null then
      raise exception 'This report has no removable post, comment, or poll response';
    end if;
    if report_row.post_id is not null then
      delete from public.posts where id = report_row.post_id;
    end if;
    if report_row.comment_id is not null then
      delete from public.comments where id = report_row.comment_id;
    end if;
    if report_row.poll_vote_id is not null then
      delete from public.poll_votes where id = report_row.poll_vote_id;
    end if;
  elsif p_action = 'remove_profile_photo' then
    if report_row.reported_user_id is null then
      raise exception 'This report has no reported account';
    end if;
    update public.profiles
    set avatar_url = null
    where id = report_row.reported_user_id;
  elsif p_action = 'remove_and_ban' then
    if report_row.reported_user_id is null then
      raise exception 'This report has no reported account';
    end if;
    if exists (
      select 1
      from public.profiles target
      where target.id = report_row.reported_user_id
        and (
          target.is_admin is true
          or exists (
            select 1 from public.admin_operator_roles membership
            where membership.user_id = target.id
              and membership.revoked_at is null
          )
        )
    ) then
      raise exception 'Administrator accounts require a separate access-revocation process';
    end if;
    update public.profiles
    set is_banned = true
    where id = report_row.reported_user_id;
  end if;

  update public.reports
  set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
      notes = normalized_reason
  where id = p_report_id
  returning * into report_row;

  insert into public.admin_report_triage (
    report_id, assigned_to, assigned_at, resolved_at, resolved_by
  ) values (
    p_report_id, uid, clock_timestamp(), clock_timestamp(), uid
  )
  on conflict (report_id) do update
    set assigned_to = coalesce(public.admin_report_triage.assigned_to, uid),
        assigned_at = coalesce(public.admin_report_triage.assigned_at, clock_timestamp()),
        resolved_at = clock_timestamp(),
        resolved_by = uid,
        updated_at = clock_timestamp();

  insert into public.admin_audit_log (
    actor_id, actor_role, action, entity_type, entity_id, reason,
    request_id, metadata
  ) values (
    uid, actor_role, 'report.' || p_action, 'report', p_report_id::text,
    normalized_reason, p_idempotency_key,
    jsonb_build_object(
      'reportedUserId', report_row.reported_user_id,
      'resultStatus', report_row.status
    )
  );

  final_result := jsonb_build_object(
    'report_id', report_row.id,
    'status', report_row.status,
    'action', p_action,
    'resolved_at', clock_timestamp()
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.admin_decide_report(uuid, text, text, text)
  from public, anon;
grant execute on function public.admin_decide_report(uuid, text, text, text)
  to authenticated;

comment on function public.get_admin_report_case(uuid) is
  'Returns one bounded Trust & Safety report with safe identities, evidence metadata, triage state, and audited history.';
comment on function public.admin_triage_report(uuid, text, text, text, text) is
  'Atomically claims, releases, prioritizes, or escalates one pending report for an AAL2 moderation operator.';
comment on function public.admin_decide_report(uuid, text, text, text) is
  'Atomically records and audits one AAL2 moderation decision and its authorized enforcement side effects.';
