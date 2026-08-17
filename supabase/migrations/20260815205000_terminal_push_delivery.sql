-- A push provider handoff is an irreversible side effect. Once a logical
-- event/recipient key is claimed, retries must never contact Expo again: the
-- provider may have accepted the first request even when our response or
-- follow-up database acknowledgement was lost.

alter table public.push_delivery_claims
  add column if not exists terminal_at timestamptz,
  add column if not exists outcome text,
  add column if not exists provider_ticket_id text,
  add column if not exists last_error text;

update public.push_delivery_claims
set terminal_at = coalesce(delivered_at, claimed_at),
    outcome = case when delivered_at is null then 'legacy_claimed' else 'accepted' end
where terminal_at is null or outcome is null;

alter table public.push_delivery_claims
  drop constraint if exists push_delivery_claims_outcome_check;
alter table public.push_delivery_claims
  add constraint push_delivery_claims_outcome_check check (
    outcome is null or outcome in (
      'claimed', 'legacy_claimed', 'accepted', 'rejected',
      'invalid_token', 'transport_error'
    )
  );

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
  if p_target_user_id is null then
    raise exception 'Push target is required';
  end if;

  insert into public.push_delivery_claims (
    delivery_key, target_user_id, category, aggregate_id,
    terminal_at, outcome
  ) values (
    p_delivery_key, p_target_user_id,
    coalesce(nullif(trim(p_category), ''), 'unknown'),
    nullif(trim(p_aggregate_id), ''), clock_timestamp(), 'claimed'
  )
  on conflict (delivery_key) do nothing;

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
  ), inserted as (
    insert into public.push_delivery_claims (
      delivery_key, target_user_id, category, aggregate_id,
      terminal_at, outcome
    )
    select 'outbox-push:' || p_event_id::text || ':' || target.user_id::text,
           target.user_id,
           coalesce(nullif(trim(p_category), ''), 'unknown'),
           nullif(trim(p_aggregate_id), ''), clock_timestamp(), 'claimed'
    from targets target
    on conflict (delivery_key) do nothing
    returning push_delivery_claims.target_user_id
  )
  select inserted.target_user_id from inserted;
$$;

create or replace function public.record_push_delivery_results(p_results jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  with results as (
    select
      nullif(trim(item ->> 'deliveryKey'), '') delivery_key,
      nullif(trim(item ->> 'outcome'), '') outcome,
      nullif(trim(item ->> 'providerTicketId'), '') provider_ticket_id,
      nullif(trim(item ->> 'error'), '') last_error
    from jsonb_array_elements(coalesce(p_results, '[]'::jsonb)) item
  )
  update public.push_delivery_claims claim
  set outcome = result.outcome,
      provider_ticket_id = result.provider_ticket_id,
      last_error = result.last_error,
      delivered_at = case
        when result.outcome = 'accepted' then coalesce(claim.delivered_at, clock_timestamp())
        else claim.delivered_at
      end
  from results result
  where claim.delivery_key = result.delivery_key
    and claim.outcome in ('claimed', 'legacy_claimed')
    and result.outcome in ('accepted', 'rejected', 'invalid_token', 'transport_error');

  get diagnostics changed = row_count;
  return changed;
end;
$$;

-- Compatibility for a relay still finishing during deployment. Completion is
-- telemetry only; claim existence already makes the handoff terminal.
create or replace function public.complete_push_deliveries_batch(
  p_event_id uuid,
  p_target_user_ids jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  update public.push_delivery_claims claim
  set delivered_at = coalesce(claim.delivered_at, clock_timestamp()),
      terminal_at = coalesce(claim.terminal_at, claim.claimed_at),
      outcome = case
        when claim.outcome in ('claimed', 'legacy_claimed') then 'accepted'
        else claim.outcome
      end
  where claim.delivery_key in (
    select 'outbox-push:' || p_event_id::text || ':' || value::uuid::text
    from jsonb_array_elements_text(coalesce(p_target_user_ids, '[]'::jsonb))
  );
  get diagnostics changed = row_count;
  return changed;
end;
$$;

revoke all on function public.claim_push_delivery(text, uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.claim_push_deliveries_batch(uuid, jsonb, text, text)
  from public, anon, authenticated;
revoke all on function public.record_push_delivery_results(jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_push_deliveries_batch(uuid, jsonb)
  from public, anon, authenticated;

grant execute on function public.claim_push_delivery(text, uuid, text, text)
  to service_role;
grant execute on function public.claim_push_deliveries_batch(uuid, jsonb, text, text)
  to service_role;
grant execute on function public.record_push_delivery_results(jsonb)
  to service_role;
grant execute on function public.complete_push_deliveries_batch(uuid, jsonb)
  to service_role;
