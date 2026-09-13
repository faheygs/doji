-- Phone alerts are a deliberately small, immediate subset of the realtime
-- Activity Center. This migration is the server-owned policy boundary: client
-- payload flags alone can never authorize a device notification.

alter table public.device_push_endpoints
  add column if not exists notification_contract_version smallint not null default 1
  check (notification_contract_version between 1 and 2);

create or replace function public.register_native_push_endpoint_v2(
  p_installation_id text,
  p_token text,
  p_platform text,
  p_environment text,
  p_expo_token text default null,
  p_notification_contract_version smallint default 2
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_notification_contract_version <> 2 then
    raise exception 'Unsupported notification contract';
  end if;
  perform public.register_native_push_endpoint(
    p_installation_id, p_token, p_platform, p_environment, p_expo_token
  );
  update public.device_push_endpoints endpoint
  set notification_contract_version = p_notification_contract_version
  where endpoint.user_id = uid
    and endpoint.installation_id = nullif(trim(p_installation_id), '')
    and endpoint.active = true;
  return found;
end;
$$;

revoke all on function public.register_native_push_endpoint_v2(
  text, text, text, text, text, smallint
) from public, anon;
grant execute on function public.register_native_push_endpoint_v2(
  text, text, text, text, text, smallint
) to authenticated;

create or replace function public.get_push_recipients(p_user_ids uuid[])
returns table (
  user_id uuid,
  notification_token text,
  notification_preferences jsonb,
  native_endpoints jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.notification_token, profile.notification_preferences,
         coalesce(native.endpoints, '[]'::jsonb)
  from public.profiles profile
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'installationId', endpoint.installation_id,
      'token', endpoint.token,
      'provider', endpoint.provider,
      'environment', endpoint.environment,
      'notificationContractVersion', endpoint.notification_contract_version
    ) order by endpoint.last_registered_at desc, endpoint.id desc) endpoints
    from (
      select endpoint.installation_id, endpoint.token, endpoint.provider,
             endpoint.environment, endpoint.notification_contract_version,
             endpoint.last_registered_at, endpoint.id
      from public.device_push_endpoints endpoint
      where endpoint.user_id = profile.id and endpoint.active = true
      order by endpoint.last_registered_at desc, endpoint.id desc
      limit 5
    ) endpoint
  ) native on true
  where profile.id = any(coalesce(p_user_ids, array[]::uuid[]))
    and cardinality(coalesce(p_user_ids, array[]::uuid[])) <= 500
    and coalesce(profile.is_banned, false) = false;
$$;

revoke all on function public.get_push_recipients(uuid[])
  from public, anon, authenticated;
grant execute on function public.get_push_recipients(uuid[]) to service_role;

create or replace function public.get_doji_push_recipients_shard_page(
  p_daily_event_id uuid,
  p_shard smallint,
  p_after_user_id uuid default null,
  p_limit integer default 500
)
returns table (user_id uuid, notification_token text, native_endpoints jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.notification_token,
         coalesce(native.endpoints, '[]'::jsonb)
  from public.profiles profile
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'installationId', endpoint.installation_id,
      'token', endpoint.token,
      'provider', endpoint.provider,
      'environment', endpoint.environment,
      'notificationContractVersion', endpoint.notification_contract_version
    ) order by endpoint.last_registered_at desc, endpoint.id desc) endpoints
    from (
      select endpoint.installation_id, endpoint.token, endpoint.provider,
             endpoint.environment, endpoint.notification_contract_version,
             endpoint.last_registered_at, endpoint.id
      from public.device_push_endpoints endpoint
      where endpoint.user_id = profile.id and endpoint.active = true
      order by endpoint.last_registered_at desc, endpoint.id desc
      limit 5
    ) endpoint
  ) native on true
  where profile.push_shard = p_shard
    and (p_after_user_id is null or profile.id > p_after_user_id)
    and (jsonb_array_length(coalesce(native.endpoints, '[]'::jsonb)) > 0
      or profile.notification_token is not null)
    and coalesce(profile.is_banned, false) = false
    and coalesce((profile.notification_preferences ->> 'push_enabled')::boolean, true)
    and coalesce(
      (profile.notification_preferences ->> 'doji_live')::boolean,
      (profile.notification_preferences ->> 'doji_start')::boolean,
      true
    )
    and (
      not exists (
        select 1 from public.daily_event_audience audience
        where audience.daily_event_id = p_daily_event_id
      )
      or exists (
        select 1 from public.daily_event_audience audience
        where audience.daily_event_id = p_daily_event_id
          and audience.user_id = profile.id
      )
    )
  order by profile.id
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
$$;

revoke all on function public.get_doji_push_recipients_shard_page(
  uuid, smallint, uuid, integer
) from public, anon, authenticated;
grant execute on function public.get_doji_push_recipients_shard_page(
  uuid, smallint, uuid, integer
) to service_role;

create table if not exists public.notification_attention_state (
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope_kind text not null check (
    scope_kind in ('daily_event', 'friendship', 'comment', 'suggestion')
  ),
  scope_id text not null check (length(scope_id) between 1 and 128),
  seen_at timestamptz not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, scope_kind, scope_id)
);

create index if not exists notification_attention_recent_idx
  on public.notification_attention_state (user_id, seen_at desc);

alter table public.notification_attention_state enable row level security;
revoke all on public.notification_attention_state from public, anon, authenticated;

create or replace function public.mark_notification_attention_seen(p_receipts jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  affected integer := 0;
  server_now timestamptz := clock_timestamp();
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(coalesce(p_receipts, 'null'::jsonb)) <> 'array' then
    raise exception 'Receipts must be an array';
  end if;
  if jsonb_array_length(p_receipts) > 100 then
    raise exception 'Too many attention receipts';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_receipts) item
    where item ->> 'scope_kind' not in ('daily_event', 'friendship', 'comment', 'suggestion')
      or nullif(trim(item ->> 'scope_id'), '') is null
      or length(trim(item ->> 'scope_id')) > 128
  ) then
    raise exception 'Invalid attention receipt';
  end if;

  insert into public.notification_attention_state (
    user_id, scope_kind, scope_id, seen_at, updated_at
  )
  select
    uid,
    item ->> 'scope_kind',
    trim(item ->> 'scope_id'),
    server_now,
    server_now
  from jsonb_array_elements(p_receipts) item
  on conflict (user_id, scope_kind, scope_id) do update
  set seen_at = greatest(
        public.notification_attention_state.seen_at,
        excluded.seen_at
      ),
      updated_at = server_now;

  get diagnostics affected = row_count;

  delete from public.notification_attention_state attention
  where attention.user_id = uid
    and (
      attention.seen_at < server_now - interval '45 days'
      or (attention.scope_kind, attention.scope_id) in (
        select older.scope_kind, older.scope_id
        from public.notification_attention_state older
        where older.user_id = uid
        order by older.seen_at desc
        offset 500
      )
    );

  return jsonb_build_object('recorded', affected, 'server_now', server_now);
end;
$$;

revoke all on function public.mark_notification_attention_seen(jsonb)
  from public, anon;
grant execute on function public.mark_notification_attention_seen(jsonb)
  to authenticated;

create or replace function public.claim_push_delivery_targets_batch_v2(
  p_event_id uuid,
  p_targets jsonb,
  p_category text,
  p_aggregate_id text default null,
  p_scope_kind text default null,
  p_scope_id text default null,
  p_occurred_at timestamptz default null
)
returns table (delivery_key text, target_user_id uuid, endpoint_key text)
language sql
security definer
set search_path = ''
as $$
  with targets as (
    select distinct
      (item ->> 'userId')::uuid user_id,
      nullif(trim(item ->> 'endpointKey'), '') endpoint_key
    from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) item
    where nullif(trim(item ->> 'userId'), '') is not null
      and nullif(trim(item ->> 'endpointKey'), '') is not null
  ), eligible as (
    select target.*
    from targets target
    where not exists (
      select 1
      from public.notification_attention_state attention
      where attention.user_id = target.user_id
        and attention.scope_kind = p_scope_kind
        and attention.scope_id = p_scope_id
        and attention.seen_at >= coalesce(p_occurred_at, '-infinity'::timestamptz)
    )
      and (
        p_scope_kind <> 'friendship'
        or exists (
          select 1 from public.friendships friendship
          where friendship.id::text = p_scope_id
            and friendship.addressee_id = target.user_id
            and friendship.status = 'pending'
        )
      )
      and (
        p_scope_kind <> 'comment'
        or exists (select 1 from public.comments comment where comment.id::text = p_scope_id)
      )
      and (
        p_scope_kind <> 'suggestion'
        or exists (
          select 1 from public.challenge_suggestions suggestion
          where suggestion.id::text = p_scope_id and suggestion.user_id = target.user_id
        )
      )
  ), claimed as (
    insert into public.push_delivery_claims (
      delivery_key, target_user_id, category, aggregate_id, terminal_at, outcome
    )
    select 'outbox-push:' || p_event_id::text || ':' || target.user_id::text || ':' ||
             target.endpoint_key,
           target.user_id,
           coalesce(nullif(trim(p_category), ''), 'unknown'),
           nullif(trim(p_aggregate_id), ''), clock_timestamp(), 'claimed'
    from eligible target
    on conflict (delivery_key) do update
    set claimed_at = clock_timestamp(),
        attempts = public.push_delivery_claims.attempts + 1,
        terminal_at = clock_timestamp(),
        outcome = 'claimed',
        last_error = null
    where public.push_delivery_claims.outcome = 'transport_error'
      and public.push_delivery_claims.attempts < 3
    returning push_delivery_claims.delivery_key,
              push_delivery_claims.target_user_id
  )
  select claimed.delivery_key, claimed.target_user_id, target.endpoint_key
  from claimed
  join eligible target on target.user_id = claimed.target_user_id
    and claimed.delivery_key = 'outbox-push:' || p_event_id::text || ':' ||
      target.user_id::text || ':' || target.endpoint_key;
$$;

revoke all on function public.claim_push_delivery_targets_batch_v2(
  uuid, jsonb, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.claim_push_delivery_targets_batch_v2(
  uuid, jsonb, text, text, text, text, timestamptz
) to service_role;

create or replace function public.enforce_os_push_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed boolean := false;
begin
  allowed :=
    (new.event_type = 'doji.activated' and coalesce((new.payload ->> 'broadcastPush')::boolean, false))
    or (
      coalesce((new.payload ->> 'sendPush')::boolean, false)
      and new.event_type in (
        'notification.friend_request.created',
        'notification.mention.created',
        'notification.comment_reply.created',
        'notification.suggestion.reviewed'
      )
    );

  if allowed then
    new.available_at := least(coalesce(new.available_at, clock_timestamp()), clock_timestamp());
    new.payload := jsonb_set(
      new.payload,
      '{preferenceKey}',
      to_jsonb(case
        when new.event_type = 'doji.activated' then 'doji_live'
        when new.event_type = 'notification.friend_request.created' then 'friend_requests'
        when new.event_type in (
          'notification.mention.created', 'notification.comment_reply.created'
        ) then 'mentions_replies'
        else 'reviews_account'
      end),
      true
    );
    return new;
  end if;

  -- These rows existed only to create delayed grouped phone alerts. Their
  -- underlying activity is already available immediately through the durable
  -- Activity Center tables and realtime invalidations.
  if new.event_type in (
    'notification.friend_activity.grouped',
    'notification.reactions.grouped',
    'notification.comment_likes.grouped'
  ) then
    return null;
  end if;

  if coalesce((new.payload ->> 'sendPush')::boolean, false)
     or coalesce((new.payload ->> 'broadcastPush')::boolean, false) then
    new.payload := jsonb_set(new.payload, '{sendPush}', 'false'::jsonb, true) - 'broadcastPush';
    new.available_at := least(coalesce(new.available_at, clock_timestamp()), clock_timestamp());
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_os_push_policy()
  from public, anon, authenticated;

drop trigger if exists enforce_os_push_policy_before_write on public.domain_event_outbox;
create trigger enforce_os_push_policy_before_write
before insert or update of event_type, payload, available_at
on public.domain_event_outbox
for each row execute function public.enforce_os_push_policy();

-- Retire delayed push-only aggregates that predate the policy, and immediately
-- release any other queued ambient event as an in-app realtime invalidation.
update public.domain_event_outbox
set published_at = clock_timestamp(),
    lease_id = null,
    leased_at = null,
    last_error = 'Retired by OS push allowlist'
where published_at is null
  and event_type in (
    'notification.friend_activity.grouped',
    'notification.reactions.grouped',
    'notification.comment_likes.grouped'
  );

update public.domain_event_outbox
set payload = jsonb_set(payload, '{sendPush}', 'false'::jsonb, true) - 'broadcastPush',
    available_at = least(available_at, clock_timestamp())
where published_at is null
  and (
    coalesce((payload ->> 'sendPush')::boolean, false)
    or coalesce((payload ->> 'broadcastPush')::boolean, false)
  )
  and not (
    (event_type = 'doji.activated' and coalesce((payload ->> 'broadcastPush')::boolean, false))
    or event_type in (
      'notification.friend_request.created',
      'notification.mention.created',
      'notification.comment_reply.created',
      'notification.suggestion.reviewed'
    )
  );

comment on table public.notification_attention_state is
  'Durable subject-level visibility receipts used to suppress stale or retrying OS alerts; not Activity Center history.';

-- Explicit mentions remain phone-alert eligible even when the mentioned user is
-- also the post owner or a community friend. The prior dedupe assumed ordinary
-- comment pushes; those are now intentionally in-app only. A direct reply still
-- owns the one phone alert when it targets the same person.
create or replace function public.trg_comment_mention_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_id uuid;
  actor_id uuid;
  actor_name text;
  reply_target_author_id uuid;
begin
  select comment.post_id, comment.user_id, reply_target.user_id,
         coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into post_id, actor_id, reply_target_author_id, actor_name
  from public.comments comment
  join public.profiles profile on profile.id = comment.user_id
  left join public.comments reply_target on reply_target.id = comment.reply_to_comment_id
  where comment.id = new.comment_id;

  if actor_id is null or new.mentioned_user_id = actor_id then return new; end if;
  if new.mentioned_user_id = reply_target_author_id then return new; end if;

  perform public.enqueue_domain_event(
    'user:' || new.mentioned_user_id::text || ':events',
    'notification.mention.created',
    new.id,
    jsonb_build_object(
      'version', 1, 'sendPush', true, 'targetUserId', new.mentioned_user_id,
      'preferenceKey', 'mentions_replies', 'title', 'You were mentioned',
      'body', coalesce(actor_name, 'Someone') || ' mentioned you in a comment',
      'type', 'MENTION', 'postId', post_id, 'commentId', new.comment_id,
      'url', '/post/' || post_id::text
    ),
    'push:mention:' || new.id::text || ':' || new.mentioned_user_id::text
  );
  return new;
end;
$$;

revoke all on function public.trg_comment_mention_push()
  from public, anon, authenticated;
