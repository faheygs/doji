-- Keep interactive social writes fast. One transaction should wake the relay
-- once, counter maintenance should not publish a second semantic event, and a
-- comment-heart response should read the maintained counter in constant time.

create or replace function public.wake_domain_event_relay()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  orchestrator_url text;
  orchestrator_secret text;
begin
  -- INSERT ... ON CONFLICT DO UPDATE fires the statement trigger even when it
  -- inserted no outbox row. Transition rows distinguish real new work.
  if not exists (select 1 from inserted_domain_events) then return null; end if;

  -- Nested business triggers can insert multiple outbox rows. pg_net only needs
  -- one post-commit wake for the transaction; the relay drains the whole batch.
  if current_setting('doji.outbox_wake_queued', true) = '1' then return null; end if;
  perform set_config('doji.outbox_wake_queued', '1', true);

  select decrypted_secret into orchestrator_url
  from vault.decrypted_secrets
  where name = 'doji_orchestrator_url'
  order by created_at desc limit 1;

  select decrypted_secret into orchestrator_secret
  from vault.decrypted_secrets
  where name = 'doji_orchestrator_secret'
  order by created_at desc limit 1;

  if orchestrator_url is null or orchestrator_secret is null then return null; end if;

  perform net.http_post(
    url := rtrim(orchestrator_url, '/') || '/outbox/wake',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || orchestrator_secret
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  return null;
end;
$$;

revoke all on function public.wake_domain_event_relay() from public, anon, authenticated;
drop trigger if exists wake_domain_event_relay_after_insert on public.domain_event_outbox;
create trigger wake_domain_event_relay_after_insert
after insert on public.domain_event_outbox
referencing new table as inserted_domain_events
for each statement execute function public.wake_domain_event_relay();

create or replace function public.update_comment_like_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The comment_like row is the semantic realtime event. Updating the cached
  -- counter must not publish a redundant feed.comment.update event.
  perform set_config('doji.comment_counter_only', '1', true);
  if tg_op = 'INSERT' then
    update public.comments
    set like_count = like_count + 1
    where id = new.comment_id;
  else
    update public.comments
    set like_count = greatest(like_count - 1, 0)
    where id = old.comment_id;
  end if;
  perform set_config('doji.comment_counter_only', '0', true);
  return null;
end;
$$;

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
  event_name text;
  payload jsonb;
  epoch_second bigint := floor(extract(epoch from clock_timestamp()))::bigint;
begin
  if tg_table_name = 'comments'
     and tg_op = 'UPDATE'
     and current_setting('doji.comment_counter_only', true) = '1' then
    return new;
  end if;

  event_name := case tg_table_name
    when 'posts' then 'feed.post.' || lower(tg_op)
    when 'reactions' then 'feed.reaction.' || lower(tg_op)
    when 'comments' then 'feed.comment.' || lower(tg_op)
    when 'comment_likes' then 'feed.comment_like.' || lower(tg_op)
    else 'feed.updated'
  end;

  if tg_table_name = 'posts' then
    post_id := row_id;
    owner_id := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
    visibility := case when tg_op = 'DELETE' then old.visibility else new.visibility end;
    community := coalesce(case when tg_op = 'DELETE'
      then old.is_community_poll else new.is_community_poll end, false);
    daily_event_id := case when tg_op = 'DELETE'
      then old.daily_event_id else new.daily_event_id end;
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
    'version', 1,
    'postId', post_id,
    'entityId', row_id,
    'dailyEventId', daily_event_id,
    'communityPoll', community
  );
  if community or visibility = 'public' then
    perform public.enqueue_domain_event(
      'feed:public',
      event_name,
      row_id,
      payload,
      'coalesce:feed:' || event_name || ':' || post_id::text || ':' || epoch_second::text
    );
  elsif owner_id is not null then
    insert into public.domain_event_outbox (topic, event_type, aggregate_id, payload)
    select distinct recipient.topic, event_name, row_id, payload
    from (
      select 'user:' || owner_id::text || ':events' topic
      union all
      select 'user:' || (case when friendship.requester_id = owner_id
        then friendship.addressee_id else friendship.requester_id end)::text || ':events'
      from public.friendships friendship
      where friendship.status = 'accepted'
        and (friendship.requester_id = owner_id or friendship.addressee_id = owner_id)
    ) recipient;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.publish_core_social_change() from public, anon, authenticated;

create or replace function public.toggle_comment_like(
  p_comment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  is_active boolean;
  total integer;
  prior_result jsonb;
  final_result jsonb;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_comment_id::text || ':' || uid::text, 0));

  select receipt.result into prior_result
  from public.command_receipts receipt
  where receipt.user_id = uid and receipt.idempotency_key = p_idempotency_key;
  if found then return prior_result; end if;

  if exists (
    select 1 from public.comment_likes
    where comment_id = p_comment_id and user_id = uid
  ) then
    delete from public.comment_likes
    where comment_id = p_comment_id and user_id = uid;
    is_active := false;
  else
    insert into public.comment_likes (comment_id, user_id)
    values (p_comment_id, uid);
    is_active := true;
  end if;

  select comment.like_count into total
  from public.comments comment
  where comment.id = p_comment_id;
  final_result := jsonb_build_object(
    'comment_id', p_comment_id,
    'active', is_active,
    'count', coalesce(total, 0)
  );
  insert into public.command_receipts (user_id, idempotency_key, result)
  values (uid, p_idempotency_key, final_result);
  return final_result;
end;
$$;

revoke all on function public.toggle_comment_like(uuid, text) from public, anon;
grant execute on function public.toggle_comment_like(uuid, text) to authenticated;
