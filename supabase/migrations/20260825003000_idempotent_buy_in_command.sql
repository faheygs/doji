-- A buy-in spends currency and must have a durable response. The legacy
-- zero-argument overload remains for installed builds; current builds use this
-- command-keyed overload so a retry cannot turn a successful debit into a
-- misleading no_buy_in_available response.

create or replace function public.buy_in_today(p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  participant public.user_events%rowtype;
  balance integer;
  prior_result jsonb;
  final_result jsonb;
  buy_in_cost constant integer := 400;
begin
  if uid is null then raise exception 'not_authenticated'; end if;
  if coalesce(length(p_idempotency_key), 0) < 16 then
    raise exception 'invalid_idempotency_key';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(uid::text || ':buy-in', 0)
  );
  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid
    and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  select occurrence.* into participant
  from public.user_events occurrence
  join public.daily_events event on event.id = occurrence.daily_event_id
  where occurrence.user_id = uid
    and occurrence.daily_event_id = (
      select latest.daily_event_id
      from public.user_events latest
      join public.daily_events latest_event on latest_event.id = latest.daily_event_id
      where latest.user_id = uid
      order by coalesce(latest_event.activated_at, latest_event.fires_at) desc,
               latest_event.created_at desc
      limit 1
    )
    and occurrence.buy_in_at is null
    and occurrence.signup_day_grace is not true
    and (
      occurrence.status = 'missed'
      or (
        occurrence.status = 'pending'
        and clock_timestamp() >= coalesce(event.closes_at, occurrence.expires_at)
      )
    )
  for update of occurrence;

  if not found then raise exception 'no_buy_in_available'; end if;
  if participant.status = 'pending' then
    update public.user_events set status = 'missed' where id = participant.id;
  end if;

  balance := public.spend_sparks(uid, buy_in_cost, 'buy_in', participant.id::text);
  if participant.streak_before_miss is not null then
    update public.profiles
    set current_streak = greatest(current_streak, participant.streak_before_miss)
    where id = uid;
  end if;
  update public.user_events
  set status = 'buy_in_open', buy_in_at = clock_timestamp()
  where id = participant.id;

  final_result := jsonb_build_object(
    'user_event_id', participant.id,
    'sparks', balance,
    'expires_at', null
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.buy_in_today(text) from public, anon;
grant execute on function public.buy_in_today(text) to authenticated;

comment on function public.buy_in_today(text) is
  'Atomic idempotent paid participation reopen. A retry returns the original debit result.';
