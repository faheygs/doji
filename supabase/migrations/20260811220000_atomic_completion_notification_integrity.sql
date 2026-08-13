-- Completion integrity: responses must belong to one occurrence, and friend
-- notifications are emitted once from the committed occurrence transition.

-- The previous function used a CASE expression over a polymorphic trigger
-- record. PostgreSQL can resolve both record branches, so profiles updates
-- attempted to read the nonexistent profiles.user_id field.
create or replace function public.publish_public_profile_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid;
begin
  if tg_table_name = 'profiles' then
    if tg_op = 'DELETE' then uid := old.id; else uid := new.id; end if;
  elsif tg_table_name = 'weekly_xp' then
    if tg_op = 'DELETE' then uid := old.user_id; else uid := new.user_id; end if;
  else
    raise exception 'Unsupported table % for publish_public_profile_change', tg_table_name;
  end if;

  if tg_table_name = 'profiles' then
    perform public.enqueue_domain_event(
      'profiles:global', 'profile.updated', uid,
      jsonb_build_object('version', 1, 'userId', uid), null
    );
  end if;

  perform public.enqueue_domain_event(
    'leaderboard:global', 'leaderboard.updated', uid,
    jsonb_build_object('version', 1, 'userId', uid), null
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.publish_public_profile_change()
  from public, anon, authenticated;

-- Current clients submit through security-definer RPCs. Remove the obsolete
-- direct-write capability so older builds cannot create an unassigned response
-- and then retry it as a new row.
revoke insert on table public.poll_votes from anon, authenticated;
drop policy if exists poll_votes_insert on public.poll_votes;
drop policy if exists poll_votes_insert_own on public.poll_votes;

alter table public.poll_votes
  drop constraint if exists poll_votes_occurrence_required;
alter table public.poll_votes
  add constraint poll_votes_occurrence_required
  check (user_event_id is not null and idempotency_key is not null) not valid;

revoke insert on table public.posts from anon, authenticated;
drop policy if exists posts_insert_own on public.posts;
drop policy if exists posts_insert on public.posts;

alter table public.posts
  drop constraint if exists posts_occurrence_required;
alter table public.posts
  add constraint posts_occurrence_required
  check (coalesce(is_community_poll, false) or user_event_id is not null) not valid;

-- Inserts are not completion events. They can be followed by additional work
-- that fails. Notify only when the user_event atomically transitions to a
-- completed state and a durable response exists for that exact occurrence.
drop trigger if exists poll_votes_friend_push on public.poll_votes;
drop trigger if exists posts_friendship_post_push on public.posts;

create or replace function public.trg_user_event_completion_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  friend_id uuid;
  actor_name text;
begin
  if old.status is not distinct from new.status
     or new.status not in ('completed', 'late') then
    return new;
  end if;

  if not exists (
    select 1 from public.poll_votes vote where vote.user_event_id = new.id
  ) and not exists (
    select 1 from public.posts post
    where post.user_event_id = new.id and coalesce(post.is_community_poll, false) is false
  ) then
    raise exception 'Cannot complete Doji occurrence without a durable response';
  end if;

  select coalesce(
      nullif(trim(profile.display_name), ''),
      nullif(trim(profile.username), ''),
      'A friend'
    )
    into actor_name
  from public.profiles profile
  where profile.id = new.user_id;

  for friend_id in
    select distinct case
      when friendship.requester_id = new.user_id then friendship.addressee_id
      else friendship.requester_id
    end
    from public.friendships friendship
    where friendship.status = 'accepted'
      and (friendship.requester_id = new.user_id or friendship.addressee_id = new.user_id)
  loop
    if friend_id <> new.user_id
       and public.can_access_daily_event(new.daily_event_id, friend_id) then
      perform public.enqueue_domain_event(
        'user:' || friend_id::text || ':events',
        'notification.friend_post',
        new.id,
        jsonb_build_object(
          'version', 1,
          'sendPush', true,
          'targetUserId', friend_id,
          'preferenceKey', 'friend_post',
          'title', 'Friend posted',
          'body', coalesce(actor_name, 'A friend') || ' completed today''s Doji',
          'type', 'FRIEND_POST',
          'userEventId', new.id,
          'dailyEventId', new.daily_event_id,
          'url', '/'
        ),
        'push:friend-completion:' || new.id::text || ':' || friend_id::text
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.trg_user_event_completion_push()
  from public, anon, authenticated;

drop trigger if exists user_event_completion_push on public.user_events;
create trigger user_event_completion_push
after update of status on public.user_events
for each row execute function public.trg_user_event_completion_push();
