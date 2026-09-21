-- The authoritative Everyone feed includes every non-demo daily post, including
-- posts whose social-alert visibility is `friends`. Publish the same bounded,
-- identifier-only membership hint for that complete query population so clients
-- can refetch and offer the stable "New posts" affordance while scrolled away.
-- Engagement remains post-scoped and is never amplified onto feed:public.

create or replace function public.publish_core_social_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  row_id uuid := case when tg_op = 'DELETE' then old.id else new.id end;
  post_id uuid;
  owner_id uuid;
  visibility text;
  community boolean := false;
  daily_event_id uuid;
  everyone_feed_member boolean := false;
  event_name text := case
    when tg_table_name = 'posts' then 'feed.post.' || lower(tg_op)
    when tg_table_name = 'reactions' then 'feed.reaction.' || lower(tg_op)
    when tg_table_name = 'comments' then 'feed.comment.' || lower(tg_op)
    else 'feed.comment_like.' || lower(tg_op)
  end;
  payload jsonb;
  epoch_second bigint := floor(extract(epoch from clock_timestamp()))::bigint;
begin
  if tg_table_name = 'comments'
     and tg_op = 'UPDATE'
     and current_setting('doji.comment_counter_only', true) = '1' then
    return new;
  end if;

  -- reaction_count/comment_count are maintained denormalized counters. Their
  -- nested UPDATE must not masquerade as feed membership/content activity.
  if tg_table_name = 'posts' and tg_op = 'UPDATE'
     and (to_jsonb(new) - 'reaction_count' - 'comment_count' - 'updated_at')
       = (to_jsonb(old) - 'reaction_count' - 'comment_count' - 'updated_at') then
    return new;
  end if;

  if tg_table_name = 'posts' then
    post_id := row_id;
    owner_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
    visibility := case when tg_op = 'DELETE' then old.visibility else new.visibility end;
    community := coalesce(case when tg_op = 'DELETE'
      then old.is_community_poll else new.is_community_poll end, false);
    daily_event_id := case when tg_op = 'DELETE'
      then old.daily_event_id else new.daily_event_id end;
    -- UPDATE must invalidate when either side belonged to Everyone so a row
    -- leaving that population is removed by the authoritative follow-up read.
    everyone_feed_member := case
      when tg_op = 'INSERT' then not coalesce(new.is_demo, false)
      when tg_op = 'DELETE' then not coalesce(old.is_demo, false)
      else not coalesce(old.is_demo, false) or not coalesce(new.is_demo, false)
    end;
  elsif tg_table_name = 'reactions' then
    post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  elsif tg_table_name = 'comments' then
    post_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
  else
    select comment.post_id into post_id
    from public.comments comment
    where comment.id = case when tg_op = 'DELETE' then old.comment_id else new.comment_id end;
  end if;

  if tg_table_name <> 'posts' and post_id is not null then
    select post.user_id, post.visibility, coalesce(post.is_community_poll, false),
           post.daily_event_id
      into owner_id, visibility, community, daily_event_id
    from public.posts post where post.id = post_id;
  end if;
  if post_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  payload := jsonb_build_object(
    'version', 1, 'postId', post_id, 'entityId', row_id,
    'dailyEventId', daily_event_id, 'communityPoll', community
  );

  if tg_table_name = 'posts' then
    if everyone_feed_member then
      perform public.enqueue_domain_event(
        'feed:public', event_name, row_id, payload,
        'coalesce:feed-posts:' || event_name || ':' ||
          coalesce(daily_event_id::text, 'none') || ':' || epoch_second::text
      );
    end if;
    if owner_id is not null then
      perform public.enqueue_domain_event(
        'user:' || owner_id::text || ':events', event_name, row_id, payload,
        'post-owner:' || event_name || ':' || row_id::text
      );
      if tg_op = 'INSERT' then
        perform public.enqueue_friend_fanout(
          'fanout.post_membership', row_id,
          jsonb_build_object(
            'actorUserId', owner_id, 'aggregateId', row_id,
            'dailyEventId', daily_event_id, 'communityPoll', community,
            'occurredAt', clock_timestamp()
          ),
          'fanout-request:post-membership:' || row_id::text
        );
      end if;
    end if;
  else
    perform public.enqueue_domain_event(
      'post:' || post_id::text, event_name, row_id, payload,
      'coalesce:post:' || event_name || ':' || post_id::text || ':' || epoch_second::text
    );
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_core_social_change()
  from public, anon, authenticated;

comment on function public.publish_core_social_change() is
  'Publishes Everyone-eligible post membership hints and post-scoped engagement hints; counter-only updates stay post-scoped.';
