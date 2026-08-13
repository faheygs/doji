-- Persist notification-center state per account so dismissed and cleared items
-- do not return after reinstalling the app or signing in on another device.

create table if not exists public.notification_center_state (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  cleared_at timestamptz,
  last_opened_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_dismissals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_key text not null,
  dismissed_at timestamptz not null default now(),
  primary key (user_id, notification_key)
);

create index if not exists notification_dismissals_user_time_idx
  on public.notification_dismissals (user_id, dismissed_at desc);

alter table public.notification_center_state enable row level security;
alter table public.notification_dismissals enable row level security;

drop policy if exists "Users manage their notification center state"
  on public.notification_center_state;
create policy "Users manage their notification center state"
  on public.notification_center_state
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users manage their notification dismissals"
  on public.notification_dismissals;
create policy "Users manage their notification dismissals"
  on public.notification_dismissals
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
