-- Enable RLS on all tables
alter table public.profiles enable row level security;
alter table public.challenges enable row level security;
alter table public.daily_events enable row level security;
alter table public.user_events enable row level security;
alter table public.posts enable row level security;
alter table public.friendships enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.streak_events enable row level security;

-- PROFILES policies
create policy "profiles_read_all" on public.profiles
  for select using (true);

create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- CHALLENGES policies (read-only for all authenticated users)
create policy "challenges_read_all" on public.challenges
  for select using (auth.role() = 'authenticated');

-- DAILY EVENTS policies (read-only for all authenticated users)
create policy "daily_events_read_all" on public.daily_events
  for select using (auth.role() = 'authenticated');

-- USER EVENTS policies
create policy "user_events_read_own" on public.user_events
  for select using (auth.uid() = user_id);

create policy "user_events_insert_own" on public.user_events
  for insert with check (auth.uid() = user_id);

create policy "user_events_update_own" on public.user_events
  for update using (auth.uid() = user_id);

-- POSTS policies
-- Helper function: check if two users are friends
create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean as $$
  select exists (
    select 1 from public.friendships
    where status = 'accepted'
    and (
      (requester_id = user_a and addressee_id = user_b)
      or
      (requester_id = user_b and addressee_id = user_a)
    )
  );
$$ language sql security definer stable;

create policy "posts_read_own" on public.posts
  for select using (user_id = auth.uid());

create policy "posts_read_friends" on public.posts
  for select using (
    visibility = 'friends' and public.are_friends(user_id, auth.uid())
  );

create policy "posts_read_public" on public.posts
  for select using (visibility = 'public');

create policy "posts_insert_own" on public.posts
  for insert with check (auth.uid() = user_id);

create policy "posts_update_own" on public.posts
  for update using (auth.uid() = user_id);

create policy "posts_delete_own" on public.posts
  for delete using (auth.uid() = user_id);

-- FRIENDSHIPS policies
create policy "friendships_read_own" on public.friendships
  for select using (
    auth.uid() = requester_id or auth.uid() = addressee_id
  );

create policy "friendships_insert" on public.friendships
  for insert with check (auth.uid() = requester_id);

create policy "friendships_update_own" on public.friendships
  for update using (
    auth.uid() = requester_id or auth.uid() = addressee_id
  );

-- REACTIONS policies
create policy "reactions_read" on public.reactions
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
      and (p.user_id = auth.uid() or p.visibility = 'public' or public.are_friends(p.user_id, auth.uid()))
    )
  );

create policy "reactions_insert" on public.reactions
  for insert with check (auth.uid() = user_id);

create policy "reactions_delete_own" on public.reactions
  for delete using (auth.uid() = user_id);

-- COMMENTS policies
create policy "comments_read" on public.comments
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
      and (p.user_id = auth.uid() or p.visibility = 'public' or public.are_friends(p.user_id, auth.uid()))
    )
  );

create policy "comments_insert" on public.comments
  for insert with check (auth.uid() = user_id);

create policy "comments_delete_own" on public.comments
  for delete using (auth.uid() = user_id);

-- STREAK EVENTS policies
create policy "streak_events_read_own" on public.streak_events
  for select using (auth.uid() = user_id);

create policy "streak_events_insert_own" on public.streak_events
  for insert with check (auth.uid() = user_id);

-- Storage buckets
insert into storage.buckets (id, name, public) values ('post-media', 'post-media', true);
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

-- Storage policies for post-media
create policy "post_media_upload" on storage.objects
  for insert with check (bucket_id = 'post-media' and auth.role() = 'authenticated');

create policy "post_media_read" on storage.objects
  for select using (bucket_id = 'post-media');

create policy "post_media_delete_own" on storage.objects
  for delete using (
    bucket_id = 'post-media' and auth.uid()::text = (storage.foldername(name))[1]
  );

-- Storage policies for avatars
create policy "avatars_upload" on storage.objects
  for insert with check (bucket_id = 'avatars' and auth.role() = 'authenticated');

create policy "avatars_update" on storage.objects
  for update using (
    bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "avatars_read" on storage.objects
  for select using (bucket_id = 'avatars');
