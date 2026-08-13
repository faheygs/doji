-- Push delivery must be idempotent independently of database, HTTP, queue, and
-- Edge Function retries. A delivery is claimed before contacting Expo; a
-- duplicate claim is a successful no-op.
create table if not exists public.push_delivery_claims (
  delivery_key text primary key,
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  aggregate_id text,
  claimed_at timestamptz not null default clock_timestamp()
);

create index if not exists push_delivery_claims_target_time_idx
  on public.push_delivery_claims (target_user_id, claimed_at desc);

alter table public.push_delivery_claims enable row level security;
revoke all on table public.push_delivery_claims from public, anon, authenticated;

create or replace function public.claim_push_delivery(
  p_delivery_key text,
  p_target_user_id uuid,
  p_category text,
  p_aggregate_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_delivery_key is null or length(p_delivery_key) < 16 then
    raise exception 'Invalid push delivery key';
  end if;
  if p_target_user_id is null then
    raise exception 'Push target is required';
  end if;

  insert into public.push_delivery_claims (
    delivery_key, target_user_id, category, aggregate_id
  ) values (
    p_delivery_key, p_target_user_id, coalesce(nullif(trim(p_category), ''), 'unknown'),
    nullif(trim(p_aggregate_id), '')
  )
  on conflict (delivery_key) do nothing;

  return found;
end;
$$;

revoke all on function public.claim_push_delivery(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.claim_push_delivery(text, uuid, text, text)
  to service_role;

-- Retire the direct pg_net friend-completion producers. These ran outside the
-- transactional outbox and could be amplified by HTTP retries. Recreate the
-- same trigger names with outbox-only producers so the change is atomic.
drop trigger if exists posts_friendship_post_push on public.posts;
drop trigger if exists poll_votes_friend_push on public.poll_votes;

create or replace function public.trg_friendship_post_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  friend_id uuid;
  actor_name text;
begin
  if coalesce(new.is_community_poll, false) or new.user_id is null then
    return new;
  end if;

  select coalesce(nullif(trim(profile.display_name), ''), nullif(trim(profile.username), ''), 'A friend')
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
    if friend_id <> new.user_id then
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
          'postId', new.id,
          'url', '/'
        ),
        'push:friend-post:' || new.id::text || ':' || friend_id::text
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.trg_friendship_post_push()
  from public, anon, authenticated;
create trigger posts_friendship_post_push
  after insert on public.posts
  for each row
  when (new.is_community_poll is not true)
  execute function public.trg_friendship_post_push();

create or replace function public.trg_poll_vote_friend_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  friend_id uuid;
  actor_name text;
begin
  select coalesce(nullif(trim(profile.display_name), ''), nullif(trim(profile.username), ''), 'A friend')
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
    if friend_id <> new.user_id then
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
          'voteId', new.id,
          'userEventId', new.user_event_id,
          'url', '/'
        ),
        'push:friend-vote:' || new.id::text || ':' || friend_id::text
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.trg_poll_vote_friend_push()
  from public, anon, authenticated;
create trigger poll_votes_friend_push
  after insert on public.poll_votes
  for each row execute function public.trg_poll_vote_friend_push();
