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
  with boundary as (
    select case
      when p_occurred_at is not null then p_occurred_at
      when p_scope_kind = 'daily_event' then coalesce(
        (
          select event.activated_at
          from public.daily_events event
          where event.id::text = p_scope_id
        ),
        'infinity'::timestamptz
      )
      else '-infinity'::timestamptz
    end occurred_at
  ), targets as (
    select distinct
      (item ->> 'userId')::uuid user_id,
      nullif(trim(item ->> 'endpointKey'), '') endpoint_key
    from jsonb_array_elements(coalesce(p_targets, '[]'::jsonb)) item
    where nullif(trim(item ->> 'userId'), '') is not null
      and nullif(trim(item ->> 'endpointKey'), '') is not null
  ), eligible as (
    select target.*
    from targets target
    cross join boundary
    where not exists (
      select 1
      from public.notification_attention_state attention
      where attention.user_id = target.user_id
        and attention.scope_kind = p_scope_kind
        and attention.scope_id = p_scope_id
        and attention.seen_at >= boundary.occurred_at
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
