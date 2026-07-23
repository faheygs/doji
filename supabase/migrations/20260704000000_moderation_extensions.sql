-- Poll vote likes: let users heart "Other" custom answers on polls / WYR
create table if not exists public.poll_vote_likes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  poll_vote_id uuid not null,
  created_at   timestamptz not null default now(),
  constraint poll_vote_likes_unique   unique (user_id, poll_vote_id),
  constraint poll_vote_likes_user_fkey foreign key (user_id)      references public.profiles(id)   on delete cascade,
  constraint poll_vote_likes_vote_fkey foreign key (poll_vote_id) references public.poll_votes(id) on delete cascade
);

alter table public.poll_vote_likes enable row level security;

create policy "poll_vote_likes_select" on public.poll_vote_likes
  for select using (true);

create policy "poll_vote_likes_own" on public.poll_vote_likes
  for all
  using  (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Extend reports to reference poll votes (for reporting "Other" custom answers)
alter table public.reports
  add column if not exists poll_vote_id uuid references public.poll_votes(id) on delete set null;
