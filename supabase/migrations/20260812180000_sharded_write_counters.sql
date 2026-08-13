-- Fixed shards prevent a launch burst from serializing every vote/reaction on
-- one option, challenge, or community-post row.

alter table public.poll_votes add column if not exists daily_event_id uuid
  references public.daily_events(id) on delete cascade;

update public.poll_votes vote
set daily_event_id = participant.daily_event_id
from public.user_events participant
where participant.id = vote.user_event_id and vote.daily_event_id is null;

create index if not exists poll_votes_event_option_created_idx
  on public.poll_votes (daily_event_id, option_id, created_at desc);

create table if not exists public.poll_vote_count_shards (
  daily_event_id uuid not null references public.daily_events(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  shard smallint not null check (shard between 0 and 127),
  vote_count integer not null default 0 check (vote_count >= 0),
  primary key (daily_event_id, option_id, shard)
);

create table if not exists public.post_engagement_shards (
  post_id uuid not null references public.posts(id) on delete cascade,
  shard smallint not null check (shard between 0 and 127),
  reaction_count integer not null default 0 check (reaction_count >= 0),
  comment_count integer not null default 0 check (comment_count >= 0),
  primary key (post_id, shard)
);

create table if not exists public.post_reaction_count_shards (
  post_id uuid not null references public.posts(id) on delete cascade,
  emoji text not null,
  shard smallint not null check (shard between 0 and 127),
  reaction_count integer not null default 0 check (reaction_count >= 0),
  primary key (post_id, emoji, shard)
);

create table if not exists public.daily_participant_shards (
  daily_event_id uuid not null references public.daily_events(id) on delete cascade,
  shard smallint not null check (shard between 0 and 127),
  participant_count integer not null default 0 check (participant_count >= 0),
  primary key (daily_event_id, shard)
);

alter table public.poll_vote_count_shards enable row level security;
alter table public.post_engagement_shards enable row level security;
alter table public.post_reaction_count_shards enable row level security;
alter table public.daily_participant_shards enable row level security;
revoke all on public.poll_vote_count_shards from public, anon, authenticated;
revoke all on public.post_engagement_shards from public, anon, authenticated;
revoke all on public.post_reaction_count_shards from public, anon, authenticated;
revoke all on public.daily_participant_shards from public, anon, authenticated;

insert into public.poll_vote_count_shards (daily_event_id, option_id, shard, vote_count)
select vote.daily_event_id, vote.option_id,
       mod((hashtextextended(vote.user_id::text, 0) & 2147483647), 128)::smallint,
       count(*)::integer
from public.poll_votes vote where vote.daily_event_id is not null
group by 1, 2, 3 on conflict do nothing;

insert into public.post_engagement_shards (post_id, shard, reaction_count, comment_count)
select activity.post_id, activity.shard, sum(activity.reactions)::integer,
       sum(activity.comments)::integer
from (
  select reaction.post_id,
    mod((hashtextextended(reaction.user_id::text, 0) & 2147483647), 128)::smallint shard,
    count(*) reactions, 0::bigint comments
  from public.reactions reaction group by 1, 2
  union all
  select comment.post_id,
    mod((hashtextextended(comment.user_id::text, 0) & 2147483647), 128)::smallint,
    0::bigint, count(*)
  from public.comments comment group by 1, 2
) activity group by 1, 2 on conflict do nothing;

insert into public.post_reaction_count_shards (post_id, emoji, shard, reaction_count)
select reaction.post_id, reaction.emoji,
  mod((hashtextextended(reaction.user_id::text, 0) & 2147483647), 128)::smallint,
  count(*)::integer
from public.reactions reaction group by 1, 2, 3 on conflict do nothing;

insert into public.daily_participant_shards (daily_event_id, shard, participant_count)
select participant.daily_event_id,
  mod((hashtextextended(participant.user_id::text, 0) & 2147483647), 128)::smallint,
  count(*)::integer
from public.user_events participant
where participant.status in ('completed', 'late')
group by 1, 2 on conflict do nothing;

create or replace function public.trg_poll_vote_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.daily_event_id is null then
    select participant.daily_event_id into new.daily_event_id
    from public.user_events participant where participant.id = new.user_event_id;
  end if;
  insert into public.poll_vote_count_shards (daily_event_id, option_id, shard, vote_count)
  values (new.daily_event_id, new.option_id,
    mod((hashtextextended(new.user_id::text, 0) & 2147483647), 128)::smallint, 1)
  on conflict (daily_event_id, option_id, shard) do update
    set vote_count = public.poll_vote_count_shards.vote_count + 1;
  return new;
end;
$$;

drop trigger if exists poll_vote_insert_trigger on public.poll_votes;
create trigger poll_vote_insert_trigger before insert on public.poll_votes
for each row execute function public.trg_poll_vote_insert();

create or replace function public.trg_poll_vote_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.poll_vote_count_shards set vote_count = greatest(vote_count - 1, 0)
  where daily_event_id = old.daily_event_id and option_id = old.option_id
    and shard = mod((hashtextextended(old.user_id::text, 0) & 2147483647), 128)::smallint;
  return old;
end;
$$;

create or replace function public.update_comment_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_post uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
declare actor uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
declare delta integer := case when tg_op = 'DELETE' then -1 else 1 end;
declare community boolean;
begin
  insert into public.post_engagement_shards (post_id, shard, comment_count)
  values (target_post, mod((hashtextextended(actor::text, 0) & 2147483647), 128)::smallint,
    greatest(delta, 0))
  on conflict (post_id, shard) do update set comment_count =
    greatest(public.post_engagement_shards.comment_count + delta, 0);
  select coalesce(post.is_community_poll, false) into community
  from public.posts post where post.id = target_post;
  if not community then
    update public.posts set comment_count = greatest(comment_count + delta, 0)
    where id = target_post;
  end if;
  return null;
end;
$$;

create or replace function public.trg_reaction_insert()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
declare community boolean;
begin
  insert into public.post_engagement_shards (post_id, shard, reaction_count)
  values (new.post_id,
    mod((hashtextextended(new.user_id::text, 0) & 2147483647), 128)::smallint, 1)
  on conflict (post_id, shard) do update set reaction_count =
    public.post_engagement_shards.reaction_count + 1;
  insert into public.post_reaction_count_shards (post_id, emoji, shard, reaction_count)
  values (new.post_id, new.emoji,
    mod((hashtextextended(new.user_id::text, 0) & 2147483647), 128)::smallint, 1)
  on conflict (post_id, emoji, shard) do update set reaction_count =
    public.post_reaction_count_shards.reaction_count + 1;
  select post.user_id, coalesce(post.is_community_poll, false)
    into owner_id, community from public.posts post where post.id = new.post_id;
  if not community then
    update public.posts set reaction_count = reaction_count + 1 where id = new.post_id;
    if owner_id is not null then
      update public.profiles set reactions_received = reactions_received + 1
      where id = owner_id;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.trg_reaction_delete()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
declare community boolean;
begin
  update public.post_engagement_shards set reaction_count = greatest(reaction_count - 1, 0)
  where post_id = old.post_id
    and shard = mod((hashtextextended(old.user_id::text, 0) & 2147483647), 128)::smallint;
  update public.post_reaction_count_shards set reaction_count = greatest(reaction_count - 1, 0)
  where post_id = old.post_id and emoji = old.emoji
    and shard = mod((hashtextextended(old.user_id::text, 0) & 2147483647), 128)::smallint;
  select post.user_id, coalesce(post.is_community_poll, false)
    into owner_id, community from public.posts post where post.id = old.post_id;
  if not community then
    update public.posts set reaction_count = greatest(reaction_count - 1, 0)
    where id = old.post_id;
    if owner_id is not null then
      update public.profiles set reactions_received = greatest(reactions_received - 1, 0)
      where id = owner_id;
    end if;
  end if;
  return old;
end;
$$;

create or replace function public.trg_daily_participant_shard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_complete boolean := old.status in ('completed', 'late');
declare new_complete boolean := new.status in ('completed', 'late');
declare delta integer;
begin
  if old_complete = new_complete then return new; end if;
  delta := case when new_complete then 1 else -1 end;
  insert into public.daily_participant_shards (daily_event_id, shard, participant_count)
  values (new.daily_event_id,
    mod((hashtextextended(new.user_id::text, 0) & 2147483647), 128)::smallint,
    greatest(delta, 0))
  on conflict (daily_event_id, shard) do update set participant_count =
    greatest(public.daily_participant_shards.participant_count + delta, 0);
  return new;
end;
$$;

drop trigger if exists daily_participant_shard on public.user_events;
create trigger daily_participant_shard after update of status on public.user_events
for each row execute function public.trg_daily_participant_shard();

-- Participation is occurrence-owned and already maintained by the status
-- shard above. Never serialize completions on the reusable challenge row.
create or replace function public.trg_post_insert_participant()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  return new;
end;
$$;
