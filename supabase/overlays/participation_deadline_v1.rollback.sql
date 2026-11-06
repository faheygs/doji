-- Restore the prior trigger implementation without rewriting participation rows.
create or replace function public.sync_pending_event_expiry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.closes_at is not null then
    update public.user_events
    set expires_at = new.closes_at
    where daily_event_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;
