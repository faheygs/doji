-- Track when a friendship became accepted so the app can show "request approved" alerts
-- after the viewer last opened the notification center.

alter table public.friendships
  add column if not exists accepted_at timestamptz;

update public.friendships
set accepted_at = created_at
where status = 'accepted' and accepted_at is null;

create or replace function public.touch_friendship_accepted_at()
returns trigger
language plpgsql
as $$
begin
  new.accepted_at := coalesce(new.accepted_at, timezone('utc', now()));
  return new;
end;
$$;

drop trigger if exists friendships_touch_accepted_at on public.friendships;
create trigger friendships_touch_accepted_at
  before update on public.friendships
  for each row
  when (new.status = 'accepted' and old.status is distinct from new.status)
  execute procedure public.touch_friendship_accepted_at();
