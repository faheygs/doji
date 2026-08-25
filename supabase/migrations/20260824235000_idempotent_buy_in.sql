-- Make a paid buy-in safe to retry after the database committed but the client
-- lost the response. The participant row is the durable command result.

create or replace function public.buy_in_today()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  participant public.user_events%rowtype;
  event_row public.daily_events%rowtype;
  balance integer;
  buy_in_cost constant integer := 400;
begin
  if uid is null then raise exception 'not_authenticated'; end if;

  select occurrence, event
  into participant, event_row
  from public.user_events occurrence
  join public.daily_events event on event.id = occurrence.daily_event_id
  where occurrence.user_id = uid
  order by coalesce(event.activated_at, event.fires_at) desc,
           event.created_at desc
  limit 1
  for update of occurrence;

  if not found then raise exception 'no_buy_in_available'; end if;

  -- A repeated request returns the already-committed result. Never charge the
  -- same participant twice, including when a network timeout hid the first
  -- successful response.
  if participant.buy_in_at is not null then
    select profile.sparks into balance
    from public.profiles profile
    where profile.id = uid;

    return jsonb_build_object(
      'user_event_id', participant.id,
      'sparks', balance,
      'expires_at', null,
      'already_purchased', true
    );
  end if;

  if participant.signup_day_grace is true then
    raise exception 'no_buy_in_available';
  end if;
  if not (
    participant.status = 'missed'
    or (
      participant.status = 'pending'
      and clock_timestamp() >= coalesce(event_row.closes_at, participant.expires_at)
    )
  ) then
    raise exception 'no_buy_in_available';
  end if;

  if participant.status = 'pending' then
    update public.user_events set status = 'missed' where id = participant.id;
  end if;

  balance := public.spend_sparks(
    uid, buy_in_cost, 'buy_in', participant.id::text
  );

  if participant.streak_before_miss is not null then
    update public.profiles
    set current_streak = greatest(current_streak, participant.streak_before_miss)
    where id = uid;
  end if;

  update public.user_events
  set status = 'buy_in_open', buy_in_at = clock_timestamp()
  where id = participant.id;

  return jsonb_build_object(
    'user_event_id', participant.id,
    'sparks', balance,
    'expires_at', null,
    'already_purchased', false
  );
end;
$$;

revoke all on function public.buy_in_today() from public, anon;
grant execute on function public.buy_in_today() to authenticated;

comment on function public.buy_in_today() is
  'Atomic retry-safe paid buy-in. A prior purchase returns its durable result without another Sparks debit.';
