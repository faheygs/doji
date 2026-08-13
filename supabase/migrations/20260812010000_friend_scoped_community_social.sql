-- Community polls are one shared post, but their social notifications are
-- friend-scoped. Realtime data remains community-wide so aggregate results are
-- correct; device alerts only fan out across accepted friendships.

create or replace function public.publish_core_social_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid;
  v_post_id uuid;
  v_owner_id uuid;
  v_visibility text;
  v_is_community boolean := false;
  v_daily_event_id uuid;
  v_event_name text;
  v_payload jsonb;
begin
  row_id := case when tg_op = 'DELETE' then old.id else new.id end;
  v_event_name := case tg_table_name
    when 'posts' then 'feed.post.' || lower(tg_op)
    when 'reactions' then 'feed.reaction.' || lower(tg_op)
    when 'comments' then 'feed.comment.' || lower(tg_op)
    when 'comment_likes' then 'feed.comment_like.' || lower(tg_op)
    else 'feed.updated'
  end;

  if tg_table_name = 'posts' then
    v_post_id := row_id;
    if tg_op = 'DELETE' then
      v_owner_id := old.user_id;
      v_visibility := old.visibility;
      v_is_community := coalesce(old.is_community_poll, false);
      v_daily_event_id := old.daily_event_id;
    else
      v_owner_id := new.user_id;
      v_visibility := new.visibility;
      v_is_community := coalesce(new.is_community_poll, false);
      v_daily_event_id := new.daily_event_id;
    end if;
  elsif tg_table_name = 'reactions' then
    v_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  elsif tg_table_name = 'comments' then
    v_post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  elsif tg_table_name = 'comment_likes' then
    select comment.post_id into v_post_id
    from public.comments comment
    where comment.id = case when tg_op = 'DELETE' then old.comment_id else new.comment_id end;
  end if;

  if tg_table_name <> 'posts' and v_post_id is not null then
    select post.user_id, post.visibility, coalesce(post.is_community_poll, false),
           post.daily_event_id
      into v_owner_id, v_visibility, v_is_community, v_daily_event_id
    from public.posts post
    where post.id = v_post_id;
  end if;

  if v_post_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_payload := jsonb_build_object(
    'version', 1,
    'postId', v_post_id,
    'entityId', row_id,
    'dailyEventId', v_daily_event_id,
    'communityPoll', v_is_community
  );

  -- Public and community content has one shared channel. Friends-only content
  -- is delivered only to the owner and their accepted friends.
  if v_is_community or v_visibility = 'public' then
    insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
    values ('feed:public', v_event_name, row_id, v_payload);
  elsif v_owner_id is not null then
    insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
    select distinct recipient.topic, v_event_name, row_id, v_payload
    from (
      select 'user:' || v_owner_id::text || ':events' as topic
      union all
      select 'user:' ||
        (case when friendship.requester_id = v_owner_id
              then friendship.addressee_id else friendship.requester_id end)::text ||
        ':events'
      from public.friendships friendship
      where friendship.status = 'accepted'
        and (friendship.requester_id = v_owner_id or friendship.addressee_id = v_owner_id)
    ) recipient;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_core_social_change() from public, anon, authenticated;

-- A reaction on a normal post alerts its owner. A reaction on a shared
-- community poll alerts only accepted friends of the actor who can see that
-- daily event. The transactional outbox and stable idempotency key guarantee
-- exactly one push per recipient.
create or replace function public.trg_reaction_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_is_community boolean;
  v_daily_event_id uuid;
  v_actor_name text;
begin
  select post.user_id, coalesce(post.is_community_poll, false), post.daily_event_id
    into v_owner_id, v_is_community, v_daily_event_id
  from public.posts post
  where post.id = new.post_id;

  select coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into v_actor_name
  from public.profiles profile
  where profile.id = new.user_id;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key
  )
  select
    'user:' || recipient.user_id::text || ':events',
    'notification.reaction.created',
    new.id,
    jsonb_build_object(
      'version', 1,
      'sendPush', true,
      'targetUserId', recipient.user_id,
      'preferenceKey', 'reactions_on_my_post',
      'title', 'New reaction',
      'body', coalesce(v_actor_name, 'Someone') || ' reacted to your post',
      'type', 'REACTION',
      'postId', new.post_id,
      'dailyEventId', v_daily_event_id,
      'url', case when v_is_community then '/' else '/post/' || new.post_id::text end
    ),
    'push:reaction:' || new.id::text || ':' || recipient.user_id::text
  from (
    select v_owner_id as user_id
    where not v_is_community and v_owner_id is not null and v_owner_id <> new.user_id
    union
    select case when friendship.requester_id = new.user_id
                then friendship.addressee_id else friendship.requester_id end as user_id
    from public.friendships friendship
    where v_is_community
      and friendship.status = 'accepted'
      and (friendship.requester_id = new.user_id or friendship.addressee_id = new.user_id)
  ) recipient
  where recipient.user_id is not null
    and recipient.user_id <> new.user_id
    and (not v_is_community or public.can_access_daily_event(v_daily_event_id, recipient.user_id))
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function public.trg_reaction_push_notify() from public, anon, authenticated;

drop trigger if exists reactions_push_notify on public.reactions;
create trigger reactions_push_notify
  after insert on public.reactions
  for each row execute function public.trg_reaction_push_notify();

-- Comments use the same ownership/friendship rule as reactions.
create or replace function public.trg_comment_push_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid;
  v_is_community boolean;
  v_comments_disabled boolean;
  v_daily_event_id uuid;
  v_actor_name text;
begin
  select post.user_id, coalesce(post.is_community_poll, false),
         coalesce(post.comments_disabled, false), post.daily_event_id
    into v_owner_id, v_is_community, v_comments_disabled, v_daily_event_id
  from public.posts post
  where post.id = new.post_id;

  if v_comments_disabled then return new; end if;

  select coalesce(nullif(profile.display_name, ''), profile.username, 'Someone')
    into v_actor_name
  from public.profiles profile
  where profile.id = new.user_id;

  insert into public.domain_event_outbox (
    topic, event_type, aggregate_id, payload, idempotency_key
  )
  select
    'user:' || recipient.user_id::text || ':events',
    'notification.comment.created',
    new.id,
    jsonb_build_object(
      'version', 1,
      'sendPush', true,
      'targetUserId', recipient.user_id,
      'preferenceKey', 'comment',
      'title', 'New comment',
      'body', coalesce(v_actor_name, 'Someone') || ' commented on your post',
      'type', 'COMMENT',
      'postId', new.post_id,
      'dailyEventId', v_daily_event_id,
      'url', case when v_is_community then '/' else '/post/' || new.post_id::text end
    ),
    'push:comment:' || new.id::text || ':' || recipient.user_id::text
  from (
    select v_owner_id as user_id
    where not v_is_community and v_owner_id is not null and v_owner_id <> new.user_id
    union
    select case when friendship.requester_id = new.user_id
                then friendship.addressee_id else friendship.requester_id end as user_id
    from public.friendships friendship
    where v_is_community
      and friendship.status = 'accepted'
      and (friendship.requester_id = new.user_id or friendship.addressee_id = new.user_id)
  ) recipient
  where recipient.user_id is not null
    and recipient.user_id <> new.user_id
    and (not v_is_community or public.can_access_daily_event(v_daily_event_id, recipient.user_id))
  on conflict (idempotency_key) do nothing;

  return new;
end;
$$;

revoke all on function public.trg_comment_push_notify() from public, anon, authenticated;

drop trigger if exists comments_push_notify on public.comments;
create trigger comments_push_notify
  after insert on public.comments
  for each row execute function public.trg_comment_push_notify();

-- Poll result reads are scoped in the database so a stale client-side friend
-- list can never hide a valid friend's vote or expose a non-friend's identity.
create or replace function public.get_poll_votes_for_feed(
  p_daily_event_id uuid,
  p_audience text default 'friends'
)
returns table (
  id uuid,
  option_id uuid,
  user_id uuid,
  custom_text text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return; end if;

  return query
  select vote.id, vote.option_id, vote.user_id, vote.custom_text, vote.created_at
  from public.poll_votes vote
  join public.user_events participant on participant.id = vote.user_event_id
  where participant.daily_event_id = p_daily_event_id
    and (
      p_audience = 'everyone'
      or vote.user_id = uid
      or exists (
        select 1
        from public.friendships friendship
        where friendship.status = 'accepted'
          and (
            (friendship.requester_id = uid and friendship.addressee_id = vote.user_id)
            or (friendship.addressee_id = uid and friendship.requester_id = vote.user_id)
          )
      )
    )
  order by vote.created_at;
end;
$$;

revoke all on function public.get_poll_votes_for_feed(uuid, text) from public, anon;
grant execute on function public.get_poll_votes_for_feed(uuid, text) to authenticated;
