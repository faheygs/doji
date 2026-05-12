-- Enable required extensions
create extension if not exists "uuid-ossp";

-- PROFILES (extends auth.users)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  username text unique not null,
  display_name text not null,
  avatar_url text,
  bio text,
  current_streak int default 0 not null,
  longest_streak int default 0 not null,
  total_completions int default 0 not null,
  total_missed int default 0 not null,
  notification_token text,
  timezone text default 'America/Denver' not null,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,
  constraint username_length check (char_length(username) >= 3 and char_length(username) <= 30),
  constraint username_format check (username ~ '^[a-z0-9_]+$')
);

-- CHALLENGES (master challenge list)
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text not null check (category in ('physical','creative','social','mental','wild')),
  difficulty int check (difficulty between 1 and 3),
  requires_photo bool default true not null,
  requires_video bool default false not null,
  requires_text bool default false not null,
  is_active bool default true not null,
  created_at timestamptz default now() not null
);

-- DAILY EVENTS (one per day, shared across all users)
create table public.daily_events (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid references public.challenges(id) not null,
  fires_at timestamptz not null,
  window_minutes int default 15 not null,
  created_at timestamptz default now() not null
);

-- USER EVENTS (per-user instance of a daily event)
create table public.user_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  daily_event_id uuid references public.daily_events(id) not null,
  status text default 'pending' not null check (status in ('pending','completed','missed','late')),
  notified_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  unique(user_id, daily_event_id)
);

-- POSTS (user challenge submissions)
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_event_id uuid references public.user_events(id) unique not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  caption text,
  photo_url text,
  video_url text,
  front_photo_url text,
  is_late bool default false not null,
  reaction_count int default 0 not null,
  comment_count int default 0 not null,
  visibility text default 'friends' not null check (visibility in ('friends','public')),
  created_at timestamptz default now() not null
);

-- FRIENDSHIPS
create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid references public.profiles(id) on delete cascade not null,
  addressee_id uuid references public.profiles(id) on delete cascade not null,
  status text default 'pending' not null check (status in ('pending','accepted','blocked')),
  created_at timestamptz default now() not null,
  unique(requester_id, addressee_id),
  constraint no_self_friendship check (requester_id != addressee_id)
);

-- REACTIONS
create table public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  emoji text not null,
  created_at timestamptz default now() not null,
  unique(post_id, user_id, emoji)
);

-- COMMENTS
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now() not null,
  constraint body_not_empty check (char_length(trim(body)) > 0)
);

-- STREAK EVENTS (history log)
create table public.streak_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade not null,
  event_type text not null check (event_type in ('extend','break','start')),
  streak_value int not null,
  created_at timestamptz default now() not null
);

-- Indexes for performance
create index idx_user_events_user_id on public.user_events(user_id);
create index idx_user_events_status on public.user_events(status);
create index idx_user_events_expires_at on public.user_events(expires_at);
create index idx_posts_user_id on public.posts(user_id);
create index idx_posts_created_at on public.posts(created_at desc);
create index idx_friendships_requester on public.friendships(requester_id);
create index idx_friendships_addressee on public.friendships(addressee_id);
create index idx_reactions_post_id on public.reactions(post_id);
create index idx_comments_post_id on public.comments(post_id);
create index idx_profiles_username on public.profiles(username);

-- Auto-update updated_at on profiles
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute procedure update_updated_at();

-- Auto-increment reaction_count on posts
create or replace function update_reaction_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set reaction_count = reaction_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set reaction_count = greatest(reaction_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger reactions_count_trigger
  after insert or delete on public.reactions
  for each row execute procedure update_reaction_count();

-- Auto-increment comment_count on posts
create or replace function update_comment_count()
returns trigger as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger comments_count_trigger
  after insert or delete on public.comments
  for each row execute procedure update_comment_count();
