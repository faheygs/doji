-- Preserve per-participant exceptions when activation/recovery stamps the shared
-- close. No backfill: existing occurrence evidence is retained for separate review.
create or replace function public.sync_pending_event_expiry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.closes_at is not null then
    update public.user_events
    set expires_at = new.closes_at
    where daily_event_id = new.id and status = 'pending'
      and signup_day_grace is not true
      and buy_in_at is null;
  end if;
  return new;
end;
$$;
