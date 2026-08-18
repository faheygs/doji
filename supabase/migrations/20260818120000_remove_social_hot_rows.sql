-- A popular post must not serialize every reaction on posts or the author's
-- profile row. Exact counts live in 128 fixed shards and are projected at read
-- time; the legacy profile counter advances only when a badge threshold is met.

create table if not exists public.profile_reaction_received_shards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  shard smallint not null check (shard between 0 and 127),
  reaction_count integer not null default 0 check (reaction_count >= 0),
  primary key (user_id, shard)
);
alter table public.profile_reaction_received_shards enable row level security;
revoke all on table public.profile_reaction_received_shards from public, anon, authenticated;

insert into public.profile_reaction_received_shards (user_id, shard, reaction_count)
select post.user_id,
       mod((hashtextextended(reaction.user_id::text, 0) & 2147483647), 128)::smallint,
       count(*)::integer
from public.reactions reaction
join public.posts post on post.id = reaction.post_id
where post.user_id is not null and post.is_community_poll is not true
group by post.user_id,
         mod((hashtextextended(reaction.user_id::text, 0) & 2147483647), 128)::smallint
on conflict (user_id, shard) do update
set reaction_count = excluded.reaction_count;

create or replace function public.profile_reactions_received(p_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(shard.reaction_count), 0)::integer
  from public.profile_reaction_received_shards shard
  where shard.user_id = p_user_id;
$$;

create or replace function public.trg_reaction_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  community boolean;
  total integer;
  stored_milestone integer;
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
  if not community and owner_id is not null then
    insert into public.profile_reaction_received_shards (user_id, shard, reaction_count)
    values (owner_id,
      mod((hashtextextended(new.user_id::text, 0) & 2147483647), 128)::smallint, 1)
    on conflict (user_id, shard) do update set reaction_count =
      public.profile_reaction_received_shards.reaction_count + 1;

    total := public.profile_reactions_received(owner_id);
    select reactions_received into stored_milestone from public.profiles where id = owner_id;
    if (total >= 100 and stored_milestone < 100)
       or (total >= 500 and stored_milestone < 500)
       or (total >= 1000 and stored_milestone < 1000) then
      update public.profiles set reactions_received = total where id = owner_id;
      perform public.evaluate_badges(owner_id);
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.trg_reaction_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  community boolean;
  actor_shard smallint :=
    mod((hashtextextended(old.user_id::text, 0) & 2147483647), 128)::smallint;
begin
  update public.post_engagement_shards
  set reaction_count = greatest(reaction_count - 1, 0)
  where post_id = old.post_id and shard = actor_shard;
  update public.post_reaction_count_shards
  set reaction_count = greatest(reaction_count - 1, 0)
  where post_id = old.post_id and emoji = old.emoji and shard = actor_shard;
  select post.user_id, coalesce(post.is_community_poll, false)
  into owner_id, community from public.posts post where post.id = old.post_id;
  if not community and owner_id is not null then
    update public.profile_reaction_received_shards
    set reaction_count = greatest(reaction_count - 1, 0)
    where user_id = owner_id and shard = actor_shard;
  end if;
  return old;
end;
$$;

create or replace function public.update_comment_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_post uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  actor uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
  delta integer := case when tg_op = 'DELETE' then -1 else 1 end;
begin
  if not exists (select 1 from public.posts post where post.id = target_post) then
    return null;
  end if;
  insert into public.post_engagement_shards (post_id, shard, comment_count)
  values (target_post,
    mod((hashtextextended(actor::text, 0) & 2147483647), 128)::smallint,
    greatest(delta, 0))
  on conflict (post_id, shard) do update set comment_count =
    greatest(public.post_engagement_shards.comment_count + delta, 0);
  return null;
end;
$$;

drop function if exists public.get_own_profile();
create function public.get_own_profile()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select to_jsonb(profile) || jsonb_build_object(
    'reactions_received', public.profile_reactions_received(profile.id)
  )
  from public.profiles profile where profile.id = auth.uid();
$$;

create or replace function public.get_profile_by_username(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result public.profiles%rowtype;
  result_json jsonb;
begin
  select profile.* into result from public.profiles profile
  where lower(profile.username) = lower(trim(p_username)) limit 1;
  if result.id is null then return null; end if;
  result_json := to_jsonb(result) || jsonb_build_object(
    'reactions_received', public.profile_reactions_received(result.id)
  );
  if result.id = auth.uid() then return result_json; end if;
  return result_json - array[
    'notification_token', 'notification_preferences', 'sparks',
    'streak_shields', 'timezone', 'app_theme', 'appearance_mode',
    'onboarding_completed_at', 'push_shard'
  ];
end;
$$;

create or replace function public.get_public_profile_view(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  profile_row public.profiles%rowtype;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  select profile.* into profile_row from public.profiles profile
  where profile.username = lower(trim(p_username)) limit 1;
  if not found then return jsonb_build_object('status', 'not_found', 'profile', null); end if;
  if exists (
    select 1 from public.blocks block
    where block.blocker_id = profile_row.id and block.blocked_id = uid
  ) then
    return jsonb_build_object('status', 'blocked_by_user', 'profile', null);
  end if;
  return jsonb_build_object('status', 'visible', 'profile', jsonb_build_object(
    'id', profile_row.id, 'username', profile_row.username,
    'display_name', profile_row.display_name, 'avatar_url', profile_row.avatar_url,
    'avatar_gradient', profile_row.avatar_gradient, 'bio', profile_row.bio,
    'current_streak', profile_row.current_streak,
    'longest_streak', profile_row.longest_streak,
    'total_completions', profile_row.total_completions,
    'total_missed', profile_row.total_missed, 'xp', profile_row.xp,
    'level', profile_row.level,
    'reactions_received', public.profile_reactions_received(profile_row.id),
    'reactions_given', profile_row.reactions_given,
    'accent_theme', profile_row.accent_theme,
    'equipped_border_key', profile_row.equipped_border_key,
    'equipped_title_key', profile_row.equipped_title_key,
    'is_admin', profile_row.is_admin, 'is_banned', profile_row.is_banned,
    'is_demo_account', profile_row.is_demo_account,
    'created_at', profile_row.created_at, 'updated_at', profile_row.updated_at
  ));
end;
$$;

revoke all on function public.profile_reactions_received(uuid) from public, anon, authenticated;
revoke all on function public.get_own_profile() from public, anon;
revoke all on function public.get_profile_by_username(text) from public, anon;
revoke all on function public.get_public_profile_view(text) from public, anon;
grant execute on function public.get_own_profile() to authenticated;
grant execute on function public.get_profile_by_username(text) to authenticated;
grant execute on function public.get_public_profile_view(text) to authenticated;
