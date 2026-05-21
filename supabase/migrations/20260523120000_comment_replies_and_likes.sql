-- Comment threads (one level of reply) and per-comment hearts.

alter table public.comments
  add column if not exists parent_id uuid references public.comments(id) on delete cascade,
  add column if not exists like_count int not null default 0;

create index if not exists idx_comments_parent_id on public.comments(parent_id);
create index if not exists idx_comments_post_parent on public.comments(post_id, parent_id);

create or replace function public.comments_enforce_parent()
returns trigger
language plpgsql
as $$
begin
  if new.parent_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.comments p
    where p.id = new.parent_id and p.post_id = new.post_id
  ) then
    raise exception 'Invalid parent comment';
  end if;

  if exists (
    select 1 from public.comments p
    where p.id = new.parent_id and p.parent_id is not null
  ) then
    raise exception 'Cannot reply to a reply';
  end if;

  return new;
end;
$$;

drop trigger if exists comments_parent_check on public.comments;
create trigger comments_parent_check
  before insert on public.comments
  for each row
  execute procedure public.comments_enforce_parent();

-- ---------------------------------------------------------------------------
-- Comment likes (hearts)
-- ---------------------------------------------------------------------------

create table if not exists public.comment_likes (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid references public.comments(id) on delete cascade not null,
  user_id uuid references public.profiles(id) on delete cascade not null,
  created_at timestamptz default now() not null,
  unique(comment_id, user_id)
);

create index if not exists idx_comment_likes_comment_id on public.comment_likes(comment_id);
create index if not exists idx_comment_likes_user_id on public.comment_likes(user_id);

create or replace function public.update_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.comments set like_count = like_count + 1 where id = new.comment_id;
  elsif TG_OP = 'DELETE' then
    update public.comments set like_count = greatest(like_count - 1, 0) where id = old.comment_id;
  end if;
  return null;
end;
$$;

drop trigger if exists comment_likes_count_trigger on public.comment_likes;
create trigger comment_likes_count_trigger
  after insert or delete on public.comment_likes
  for each row
  execute procedure public.update_comment_like_count();

alter table public.comment_likes enable row level security;

create policy "comment_likes_read" on public.comment_likes
  for select using (
    exists (
      select 1 from public.comments c
      where c.id = comment_id
    )
  );

create policy "comment_likes_insert_own" on public.comment_likes
  for insert with check (auth.uid() = user_id);

create policy "comment_likes_delete_own" on public.comment_likes
  for delete using (auth.uid() = user_id);

-- Realtime (ignore if already added)
alter publication supabase_realtime add table public.comment_likes;
