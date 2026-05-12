-- user_events had no created_at; notification center and clients use it for ordering and
-- “since you last opened alerts” logic for new challenges.

alter table public.user_events add column if not exists created_at timestamptz;

update public.user_events
set created_at = expires_at - interval '20 minutes'
where created_at is null;

alter table public.user_events alter column created_at set default (timezone('utc', now()));

alter table public.user_events alter column created_at set not null;
