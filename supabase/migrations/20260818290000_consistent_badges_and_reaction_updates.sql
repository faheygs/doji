-- Badge progress is a lifetime achievement projection of authoritative metrics.
-- Each relevant write evaluates only its bounded category; thresholds come from
-- badge_tiers so the database and UI cannot drift onto separate hard-coded rules.

create or replace function public.badge_metric_value(
  p_user_id uuid,
  p_criteria_type text
) returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result bigint := 0;
begin
  select case p_criteria_type
    when 'streak_days' then greatest(profile.current_streak, profile.longest_streak)
    when 'completions' then profile.total_completions
    when 'total_xp' then profile.xp
    when 'level_reached' then profile.level
    when 'reactions_received' then public.profile_reactions_received(profile.id)
    when 'reactions_given' then profile.reactions_given
    when 'poll_votes' then (
      select count(*) from public.poll_votes vote where vote.user_id = profile.id
    )
    when 'friends_count' then public.friend_count(profile.id)
    when 'ideas_submitted' then (
      select count(*) from public.challenge_suggestions idea where idea.user_id = profile.id
    )
    when 'challenge_idea' then (
      select count(*) from public.challenge_suggestions idea where idea.user_id = profile.id
    )
    when 'ideas_picked' then (
      select count(*) from public.challenge_suggestions idea
      where idea.user_id = profile.id and idea.selected_at is not null
    )
    when 'challenge_idea_picked' then (
      select count(*) from public.challenge_suggestions idea
      where idea.user_id = profile.id and idea.selected_at is not null
    )
    else 0
  end into result
  from public.profiles profile where profile.id = p_user_id;
  return coalesce(result, 0);
end;
$$;

create or replace function public.sync_badge_category(
  p_user_id uuid,
  p_category_id text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  tier_row record;
  earned_tier text;
begin
  for tier_row in
    select tier.tier, tier.criteria_type, tier.criteria_value
    from public.badge_tiers tier
    where tier.category_id = p_category_id
    order by tier.sort_order
  loop
    if public.badge_metric_value(p_user_id, tier_row.criteria_type)
       >= tier_row.criteria_value then
      earned_tier := tier_row.tier;
    end if;
  end loop;
  if earned_tier is not null then
    perform public.upsert_badge_tier(p_user_id, p_category_id, earned_tier);
  end if;
end;
$$;

create or replace function public.sync_all_badges_for_user(p_user_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare category_row record;
begin
  for category_row in select category.id from public.badge_categories category loop
    perform public.sync_badge_category(p_user_id, category_row.id);
  end loop;
end;
$$;

create or replace function public.award_tiered_badges_for_user(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  select public.sync_all_badges_for_user(p_user_id);
$$;

-- Compatibility for the sharded reactions-received threshold trigger.
create or replace function public.evaluate_badges(p_user_id uuid)
returns void language sql security definer set search_path = '' as $$
  select public.sync_all_badges_for_user(p_user_id);
$$;

create or replace function public.trg_sync_profile_badges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.current_streak is distinct from new.current_streak
     or old.longest_streak is distinct from new.longest_streak then
    perform public.sync_badge_category(new.id, 'streak');
  end if;
  if old.total_completions is distinct from new.total_completions then
    perform public.sync_badge_category(new.id, 'completions');
  end if;
  if old.xp is distinct from new.xp then
    perform public.sync_badge_category(new.id, 'xp');
  end if;
  if old.level is distinct from new.level then
    perform public.sync_badge_category(new.id, 'level');
  end if;
  if old.reactions_given is distinct from new.reactions_given then
    perform public.sync_badge_category(new.id, 'reactions_given');
  end if;
  return new;
end;
$$;

drop trigger if exists sync_profile_badges on public.profiles;
create trigger sync_profile_badges
after update of current_streak, longest_streak, total_completions, xp, level, reactions_given
on public.profiles for each row execute function public.trg_sync_profile_badges();

create or replace function public.trg_sync_poll_badge()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_badge_category(new.user_id, 'poll_votes');
  return new;
end;
$$;
drop trigger if exists sync_poll_badge on public.poll_votes;
create trigger sync_poll_badge after insert on public.poll_votes
for each row execute function public.trg_sync_poll_badge();

create or replace function public.trg_sync_friend_badges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'accepted' and
     (tg_op = 'INSERT' or old.status is distinct from new.status) then
    perform public.sync_badge_category(new.requester_id, 'social');
    perform public.sync_badge_category(new.addressee_id, 'social');
  end if;
  return new;
end;
$$;
drop trigger if exists sync_friend_badges on public.friendships;
create trigger sync_friend_badges after insert or update of status on public.friendships
for each row execute function public.trg_sync_friend_badges();

create or replace function public.trg_sync_suggestion_badges()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.sync_badge_category(new.user_id, 'ideas');
  return new;
end;
$$;
drop trigger if exists sync_suggestion_badges on public.challenge_suggestions;
create trigger sync_suggestion_badges after insert or update of selected_at
on public.challenge_suggestions for each row
execute function public.trg_sync_suggestion_badges();

-- Reaction changes keep the fixed-shard breakdown exact. Previously changing
-- emoji updated the base row but never moved its sharded count.
create or replace function public.trg_reaction_emoji_update()
returns trigger language plpgsql security definer set search_path = '' as $$
declare actor_shard smallint :=
  mod((hashtextextended(new.user_id::text, 0) & 2147483647), 128)::smallint;
begin
  update public.post_reaction_count_shards
  set reaction_count = greatest(reaction_count - 1, 0)
  where post_id = old.post_id and emoji = old.emoji and shard = actor_shard;
  insert into public.post_reaction_count_shards (post_id, emoji, shard, reaction_count)
  values (new.post_id, new.emoji, actor_shard, 1)
  on conflict (post_id, emoji, shard) do update set reaction_count =
    public.post_reaction_count_shards.reaction_count + 1;
  return new;
end;
$$;
drop trigger if exists reaction_emoji_shard_update on public.reactions;
create trigger reaction_emoji_shard_update after update of emoji on public.reactions
for each row when (old.emoji is distinct from new.emoji)
execute function public.trg_reaction_emoji_update();

-- Repair any historical emoji switches, then award any missing legitimate tiers.
delete from public.post_reaction_count_shards;
insert into public.post_reaction_count_shards (post_id, emoji, shard, reaction_count)
select reaction.post_id, reaction.emoji,
  mod((hashtextextended(reaction.user_id::text, 0) & 2147483647), 128)::smallint,
  count(*)::integer
from public.reactions reaction
group by reaction.post_id, reaction.emoji,
  mod((hashtextextended(reaction.user_id::text, 0) & 2147483647), 128)::smallint;

do $$ declare profile_row record;
begin
  for profile_row in select profile.id from public.profiles profile loop
    perform public.sync_all_badges_for_user(profile_row.id);
  end loop;
end $$;

drop trigger if exists user_event_tiered_badges on public.user_events;

revoke all on function public.badge_metric_value(uuid, text) from public, anon, authenticated;
revoke all on function public.sync_badge_category(uuid, text) from public, anon, authenticated;
revoke all on function public.sync_all_badges_for_user(uuid) from public, anon, authenticated;
revoke all on function public.award_tiered_badges_for_user(uuid) from public, anon, authenticated;
revoke all on function public.evaluate_badges(uuid) from public, anon, authenticated;
revoke all on function public.trg_sync_profile_badges() from public, anon, authenticated;
revoke all on function public.trg_sync_poll_badge() from public, anon, authenticated;
revoke all on function public.trg_sync_friend_badges() from public, anon, authenticated;
revoke all on function public.trg_sync_suggestion_badges() from public, anon, authenticated;
revoke all on function public.trg_reaction_emoji_update() from public, anon, authenticated;
