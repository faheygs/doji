-- APNs provider JWTs are valid across provider servers, but Apple rejects
-- credentials that are rotated more than once every 20 minutes. Edge Function
-- module state is isolate-local, so coordinate one short-lived token through a
-- service-role-only row while keeping the permanent .p8 key in Edge secrets.

create table if not exists public.apns_provider_tokens (
  key_id text primary key,
  team_id text not null,
  provider_token text,
  issued_at timestamptz,
  refresh_lease_id uuid,
  refresh_lease_until timestamptz,
  updated_at timestamptz not null default clock_timestamp(),
  constraint apns_provider_tokens_key_id_check check (length(key_id) between 8 and 32),
  constraint apns_provider_tokens_team_id_check check (length(team_id) between 8 and 32),
  constraint apns_provider_tokens_token_check check (
    provider_token is null or length(provider_token) between 64 and 4096
  )
);

alter table public.apns_provider_tokens enable row level security;
revoke all on table public.apns_provider_tokens from public, anon, authenticated;

comment on table public.apns_provider_tokens is
  'Service-only cache for short-lived APNs provider JWTs. Permanent signing keys never enter Postgres.';

create or replace function public.claim_apns_provider_token(
  p_key_id text,
  p_team_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  token_row public.apns_provider_tokens%rowtype;
  lease_id uuid;
  now_at timestamptz := clock_timestamp();
begin
  p_key_id := trim(coalesce(p_key_id, ''));
  p_team_id := trim(coalesce(p_team_id, ''));
  if length(p_key_id) not between 8 and 32
    or length(p_team_id) not between 8 and 32 then
    raise exception 'Invalid APNs credential identity';
  end if;

  insert into public.apns_provider_tokens (key_id, team_id)
  values (p_key_id, p_team_id)
  on conflict (key_id) do nothing;

  select * into token_row
  from public.apns_provider_tokens token
  where token.key_id = p_key_id
  for update;

  if token_row.team_id <> p_team_id then
    raise exception 'APNs key is already associated with a different team';
  end if;

  -- Normal path: every isolate and both push functions reuse this token.
  if token_row.provider_token is not null
    and token_row.issued_at > now_at - interval '45 minutes' then
    return jsonb_build_object(
      'state', 'ready',
      'provider_token', token_row.provider_token,
      'issued_at', token_row.issued_at
    );
  end if;

  -- One isolate refreshes. Other isolates may continue using the old token
  -- while it is safely below Apple's one-hour expiry.
  if token_row.refresh_lease_until is not null
    and token_row.refresh_lease_until > now_at then
    if token_row.provider_token is not null
      and token_row.issued_at > now_at - interval '55 minutes' then
      return jsonb_build_object(
        'state', 'ready',
        'provider_token', token_row.provider_token,
        'issued_at', token_row.issued_at
      );
    end if;
    return jsonb_build_object('state', 'wait', 'retry_after_ms', 50);
  end if;

  lease_id := gen_random_uuid();
  update public.apns_provider_tokens
  set refresh_lease_id = lease_id,
      refresh_lease_until = now_at + interval '10 seconds',
      updated_at = now_at
  where key_id = p_key_id;

  return jsonb_build_object(
    'state', 'refresh',
    'lease_id', lease_id,
    'provider_token', token_row.provider_token,
    'issued_at', token_row.issued_at
  );
end;
$$;

create or replace function public.store_apns_provider_token(
  p_key_id text,
  p_team_id text,
  p_lease_id uuid,
  p_provider_token text,
  p_issued_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_id is null
    or length(coalesce(p_provider_token, '')) not between 64 and 4096
    or p_issued_at < clock_timestamp() - interval '5 minutes'
    or p_issued_at > clock_timestamp() + interval '1 minute' then
    raise exception 'Invalid APNs provider token publication';
  end if;

  update public.apns_provider_tokens token
  set provider_token = p_provider_token,
      issued_at = p_issued_at,
      refresh_lease_id = null,
      refresh_lease_until = null,
      updated_at = clock_timestamp()
  where token.key_id = trim(p_key_id)
    and token.team_id = trim(p_team_id)
    and token.refresh_lease_id = p_lease_id
    and token.refresh_lease_until > clock_timestamp() - interval '5 seconds';

  return found;
end;
$$;

revoke all on function public.claim_apns_provider_token(text, text)
  from public, anon, authenticated;
revoke all on function public.store_apns_provider_token(text, text, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_apns_provider_token(text, text) to service_role;
grant execute on function public.store_apns_provider_token(text, text, uuid, text, timestamptz)
  to service_role;

-- Surface provider-wide credential failures in the existing one-minute health
-- loop. These failures are distinct from invalid device tokens and should page
-- the operator rather than silently look like ordinary recipient rejection.
create or replace function public.get_operational_health()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with outbox as (
    select
      count(*) filter (
        where event.published_at is null
          and coalesce(event.available_at, event.created_at)
            < clock_timestamp() - interval '60 seconds'
      )::integer overdue,
      count(*) filter (
        where event.published_at is null and event.attempts >= 10
      )::integer exhausted,
      coalesce(max(extract(epoch from clock_timestamp()
        - coalesce(event.available_at, event.created_at))) filter (
          where event.published_at is null
            and coalesce(event.available_at, event.created_at) <= clock_timestamp()
        ), 0)::integer oldest_due_seconds
    from public.domain_event_outbox event
  ), push as (
    select
      count(*) filter (
        where shard.status in ('pending', 'processing')
          and shard.updated_at < clock_timestamp() - interval '60 seconds'
      )::integer stale,
      count(*) filter (
        where shard.status <> 'completed' and shard.attempts >= 8
      )::integer exhausted
    from public.push_fanout_shards shard
    join public.daily_events event on event.id = shard.daily_event_id
    where event.activated_at > clock_timestamp() - interval '1 day'
  ), provider as (
    select
      count(*)::integer credential_errors,
      max(claim.last_error) latest_credential_error
    from public.push_delivery_claims claim
    where claim.terminal_at > clock_timestamp() - interval '5 minutes'
      and (
        claim.last_error like '%TooManyProviderTokenUpdates%'
        or claim.last_error like '%InvalidProviderToken%'
        or claim.last_error like '%ExpiredProviderToken%'
      )
  )
  select jsonb_build_object(
    'healthy', outbox.overdue = 0 and outbox.exhausted = 0
      and push.stale = 0 and push.exhausted = 0
      and provider.credential_errors = 0,
    'checked_at', clock_timestamp(),
    'outbox_overdue', outbox.overdue,
    'outbox_exhausted', outbox.exhausted,
    'outbox_oldest_due_seconds', outbox.oldest_due_seconds,
    'push_stale_shards', push.stale,
    'push_exhausted_shards', push.exhausted,
    'apns_provider_credential_errors', provider.credential_errors,
    'apns_latest_provider_credential_error', provider.latest_credential_error
  )
  from outbox cross join push cross join provider;
$$;

revoke all on function public.get_operational_health()
  from public, anon, authenticated;
grant execute on function public.get_operational_health() to service_role;
