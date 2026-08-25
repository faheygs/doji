-- Provider collapse identifiers make bounded retries safe.  A provider-accepted
-- delivery remains terminal; only a request that failed at the transport layer
-- before a confirmed handoff may be reclaimed, at most twice.

create or replace function public.claim_push_delivery(
  p_delivery_key text,
  p_target_user_id uuid,
  p_category text,
  p_aggregate_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_delivery_key is null or length(p_delivery_key) < 16 then
    raise exception 'Invalid push delivery key';
  end if;
  if p_target_user_id is null then raise exception 'Push target is required'; end if;

  insert into public.push_delivery_claims (
    delivery_key, target_user_id, category, aggregate_id, terminal_at, outcome
  ) values (
    p_delivery_key, p_target_user_id,
    coalesce(nullif(trim(p_category), ''), 'unknown'),
    nullif(trim(p_aggregate_id), ''), clock_timestamp(), 'claimed'
  )
  on conflict (delivery_key) do update
  set claimed_at = clock_timestamp(),
      attempts = public.push_delivery_claims.attempts + 1,
      terminal_at = clock_timestamp(),
      outcome = 'claimed',
      last_error = null
  where public.push_delivery_claims.outcome = 'transport_error'
    and public.push_delivery_claims.attempts < 3;
  return found;
end;
$$;

create or replace function public.claim_push_deliveries_batch(
  p_event_id uuid,
  p_target_user_ids jsonb,
  p_category text,
  p_aggregate_id text default null
)
returns table (target_user_id uuid)
language sql
security definer
set search_path = ''
as $$
  with targets as (
    select distinct value::uuid as user_id
    from jsonb_array_elements_text(coalesce(p_target_user_ids, '[]'::jsonb))
  ), claimed as (
    insert into public.push_delivery_claims (
      delivery_key, target_user_id, category, aggregate_id, terminal_at, outcome
    )
    select 'outbox-push:' || p_event_id::text || ':' || target.user_id::text,
           target.user_id,
           coalesce(nullif(trim(p_category), ''), 'unknown'),
           nullif(trim(p_aggregate_id), ''), clock_timestamp(), 'claimed'
    from targets target
    on conflict (delivery_key) do update
    set claimed_at = clock_timestamp(),
        attempts = public.push_delivery_claims.attempts + 1,
        terminal_at = clock_timestamp(),
        outcome = 'claimed',
        last_error = null
    where public.push_delivery_claims.outcome = 'transport_error'
      and public.push_delivery_claims.attempts < 3
    returning push_delivery_claims.target_user_id
  )
  select claimed.target_user_id from claimed;
$$;

create or replace function public.claim_push_delivery_targets_batch(
  p_event_id uuid,
  p_targets jsonb,
  p_category text,
  p_aggregate_id text default null
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
  ), claimed as (
    insert into public.push_delivery_claims (
      delivery_key, target_user_id, category, aggregate_id, terminal_at, outcome
    )
    select 'outbox-push:' || p_event_id::text || ':' || target.user_id::text || ':' ||
             target.endpoint_key,
           target.user_id,
           coalesce(nullif(trim(p_category), ''), 'unknown'),
           nullif(trim(p_aggregate_id), ''), clock_timestamp(), 'claimed'
    from targets target
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
  join targets target on target.user_id = claimed.target_user_id
    and claimed.delivery_key = 'outbox-push:' || p_event_id::text || ':' ||
      target.user_id::text || ':' || target.endpoint_key;
$$;

revoke all on function public.claim_push_delivery(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_push_deliveries_batch(uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_push_delivery_targets_batch(uuid, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_push_delivery(text, uuid, text, text) to service_role;
grant execute on function public.claim_push_deliveries_batch(uuid, jsonb, text, text) to service_role;
grant execute on function public.claim_push_delivery_targets_batch(uuid, jsonb, text, text)
  to service_role;
