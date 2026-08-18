-- Keep upload bookkeeping bounded without deleting committed media, and expose a
-- service-only aggregate for monitoring the partitioned Doji push launch.

create index if not exists media_upload_intents_committed_retention_idx
  on public.media_upload_intents (committed_at, id)
  where committed_at is not null;

create or replace function public.delete_stale_committed_media_upload_intents(
  p_limit integer default 5000
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  batch_limit integer := least(greatest(coalesce(p_limit, 5000), 100), 10000);
  deleted_count integer := 0;
begin
  with doomed as (
    select intent.id
    from public.media_upload_intents intent
    where intent.committed_at < clock_timestamp() - interval '30 days'
      and not exists (
        select 1 from public.posts post
        where post.user_event_id = intent.user_event_id
      )
    order by intent.committed_at, intent.id
    limit batch_limit
  )
  delete from public.media_upload_intents intent
  using doomed
  where intent.id = doomed.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_stale_committed_media_upload_intents(integer)
  from public, anon, authenticated;
grant execute on function public.delete_stale_committed_media_upload_intents(integer)
  to service_role;

create or replace function public.get_doji_push_fanout_health(p_daily_event_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'daily_event_id', event.id,
    'activated_at', event.activated_at,
    'closes_at', event.closes_at,
    'total_shards', count(shard.shard),
    'pending_shards', count(*) filter (where shard.status = 'pending'),
    'processing_shards', count(*) filter (where shard.status = 'processing'),
    'completed_shards', count(*) filter (where shard.status = 'completed'),
    'expired_shards', count(*) filter (where shard.status = 'expired'),
    'claimed_recipients', coalesce(sum(shard.claimed_recipients), 0),
    'provider_accepted', coalesce(sum(shard.provider_accepted), 0),
    'attempts', coalesce(sum(shard.attempts), 0),
    'last_progress_at', max(shard.updated_at),
    'completed_at', max(shard.completed_at),
    'duration_ms', case
      when event.activated_at is null then null
      else floor(extract(epoch from
        (coalesce(max(shard.completed_at), clock_timestamp()) - event.activated_at)
      ) * 1000)::bigint
    end,
    'overdue', event.activated_at is not null
      and clock_timestamp() > event.activated_at + interval '60 seconds'
      and count(*) filter (where shard.status in ('pending', 'processing')) > 0,
    'failed_shards', count(*) filter (where shard.last_error is not null)
  )
  from public.daily_events event
  left join public.push_fanout_shards shard
    on shard.daily_event_id = event.id
  where event.id = p_daily_event_id
  group by event.id, event.activated_at, event.closes_at;
$$;

revoke all on function public.get_doji_push_fanout_health(uuid)
  from public, anon, authenticated;
grant execute on function public.get_doji_push_fanout_health(uuid) to service_role;

-- Relationship-aware voter pages avoid downloading the viewer's entire friend graph
-- just to label or scope a 30-50 row sheet.
create index if not exists reactions_post_created_page_idx
  on public.reactions (post_id, created_at desc, id desc);
create index if not exists comment_likes_comment_created_page_idx
  on public.comment_likes (comment_id, created_at desc, id desc);

create or replace function public.viewer_relationship_status(p_target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when auth.uid() is null then 'none'
    when p_target_user_id = auth.uid() then 'self'
    when exists (
      select 1 from public.friendships friendship
      where friendship.status = 'accepted'
        and ((friendship.requester_id = auth.uid() and friendship.addressee_id = p_target_user_id)
          or (friendship.addressee_id = auth.uid() and friendship.requester_id = p_target_user_id))
    ) then 'friends'
    when exists (
      select 1 from public.friendships friendship
      where friendship.status = 'pending'
        and friendship.requester_id = auth.uid()
        and friendship.addressee_id = p_target_user_id
    ) then 'pending_out'
    when exists (
      select 1 from public.friendships friendship
      where friendship.status = 'pending'
        and friendship.addressee_id = auth.uid()
        and friendship.requester_id = p_target_user_id
    ) then 'pending_in'
    else 'none'
  end;
$$;

revoke all on function public.viewer_relationship_status(uuid) from public, anon;
grant execute on function public.viewer_relationship_status(uuid) to authenticated;

create or replace function public.get_post_reaction_voters_page(
  p_post_id uuid,
  p_audience text default 'everyone',
  p_limit integer default 50,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;

  select coalesce(jsonb_agg(page.row_json order by page.created_at desc, page.id desc), '[]'::jsonb)
  into result
  from (
    select reaction.id, reaction.created_at,
      jsonb_build_object(
        'id', reaction.id,
        'post_id', reaction.post_id,
        'user_id', reaction.user_id,
        'emoji', reaction.emoji,
        'created_at', reaction.created_at,
        'friendship_status', public.viewer_relationship_status(reaction.user_id),
        'profile', jsonb_build_object(
          'id', profile.id,
          'username', profile.username,
          'display_name', profile.display_name,
          'avatar_url', profile.avatar_url,
          'equipped_border_key', profile.equipped_border_key
        )
      ) row_json
    from public.reactions reaction
    join public.profiles profile on profile.id = reaction.user_id
    where reaction.post_id = p_post_id
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = uid and block.blocked_id = reaction.user_id)
           or (block.blocked_id = uid and block.blocker_id = reaction.user_id)
      )
      and (p_audience = 'everyone' or reaction.user_id = uid or exists (
        select 1 from public.friendships friendship
        where friendship.status = 'accepted'
          and ((friendship.requester_id = uid and friendship.addressee_id = reaction.user_id)
            or (friendship.addressee_id = uid and friendship.requester_id = reaction.user_id))
      ))
      and (
        p_before_created_at is null
        or reaction.created_at < p_before_created_at
        or (reaction.created_at = p_before_created_at and reaction.id < p_before_id)
      )
    order by reaction.created_at desc, reaction.id desc
    limit least(greatest(coalesce(p_limit, 50), 1), 50)
  ) page;
  return result;
end;
$$;

revoke all on function public.get_post_reaction_voters_page(uuid, text, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_post_reaction_voters_page(uuid, text, integer, timestamptz, uuid)
  to authenticated;

create or replace function public.get_comment_like_voters_page(
  p_comment_id uuid,
  p_limit integer default 30,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;

  select coalesce(jsonb_agg(page.row_json order by page.created_at desc, page.id desc), '[]'::jsonb)
  into result
  from (
    select liked.id, liked.created_at,
      jsonb_build_object(
        'id', liked.id,
        'user_id', liked.user_id,
        'created_at', liked.created_at,
        'friendship_status', public.viewer_relationship_status(liked.user_id),
        'profile', jsonb_build_object(
          'id', profile.id,
          'username', profile.username,
          'display_name', profile.display_name,
          'avatar_url', profile.avatar_url,
          'equipped_border_key', profile.equipped_border_key
        )
      ) row_json
    from public.comment_likes liked
    join public.profiles profile on profile.id = liked.user_id
    where liked.comment_id = p_comment_id
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = uid and block.blocked_id = liked.user_id)
           or (block.blocked_id = uid and block.blocker_id = liked.user_id)
      )
      and (
        p_before_created_at is null
        or liked.created_at < p_before_created_at
        or (liked.created_at = p_before_created_at and liked.id < p_before_id)
      )
    order by liked.created_at desc, liked.id desc
    limit least(greatest(coalesce(p_limit, 30), 1), 50)
  ) page;
  return result;
end;
$$;

revoke all on function public.get_comment_like_voters_page(uuid, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_comment_like_voters_page(uuid, integer, timestamptz, uuid)
  to authenticated;

create or replace function public.get_post_reaction_summaries(p_post_ids uuid[])
returns table (post_id uuid, reaction_breakdown jsonb, my_reactions jsonb)
language sql
stable
security invoker
set search_path = ''
as $$
  with requested as (
    select distinct requested_id post_id
    from unnest(coalesce(p_post_ids, array[]::uuid[])) requested_id
    limit 50
  ), totals as (
    select reaction.post_id, reaction.emoji, count(*)::integer reaction_count
    from public.reactions reaction
    join requested on requested.post_id = reaction.post_id
    group by reaction.post_id, reaction.emoji
  ), summaries as (
    select total.post_id,
      jsonb_object_agg(total.emoji, total.reaction_count) reaction_breakdown
    from totals total group by total.post_id
  ), mine as (
    select reaction.post_id, jsonb_agg(reaction.emoji) my_reactions
    from public.reactions reaction
    join requested on requested.post_id = reaction.post_id
    where reaction.user_id = auth.uid()
    group by reaction.post_id
  )
  select requested.post_id,
    coalesce(summaries.reaction_breakdown, '{}'::jsonb),
    coalesce(mine.my_reactions, '[]'::jsonb)
  from requested
  left join summaries on summaries.post_id = requested.post_id
  left join mine on mine.post_id = requested.post_id;
$$;

revoke all on function public.get_post_reaction_summaries(uuid[]) from public, anon;
grant execute on function public.get_post_reaction_summaries(uuid[]) to authenticated;

drop function if exists public.get_poll_option_voters_page(uuid, uuid, text, integer, integer);

create or replace function public.get_poll_option_voters_page(
  p_daily_event_id uuid,
  p_option_id uuid,
  p_audience text default 'friends',
  p_limit integer default 40,
  p_before_created_at timestamptz default null,
  p_before_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  result jsonb;
begin
  if uid is null then raise exception 'Not authenticated'; end if;
  if p_audience not in ('friends', 'everyone') then raise exception 'Invalid audience'; end if;
  if not public.can_access_daily_event(p_daily_event_id, uid) then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(to_jsonb(page_rows) order by page_rows.created_at desc), '[]'::jsonb)
  into result
  from (
    select vote.id as vote_id, vote.user_id, vote.custom_text, vote.created_at,
           profile.username, profile.display_name, profile.avatar_url,
           profile.equipped_border_key,
           public.viewer_relationship_status(vote.user_id) friendship_status,
           (select count(*)::integer from public.poll_vote_likes likes
             where likes.poll_vote_id = vote.id) as like_count,
           exists (
             select 1 from public.poll_vote_likes likes
             where likes.poll_vote_id = vote.id and likes.user_id = uid
           ) as my_like
    from public.poll_votes vote
    join public.profiles profile on profile.id = vote.user_id
    where vote.daily_event_id = p_daily_event_id
      and vote.option_id = p_option_id
      and (
        p_audience = 'everyone' or vote.user_id = uid or exists (
          select 1 from public.friendships friendship
          where friendship.status = 'accepted'
            and ((friendship.requester_id = uid and friendship.addressee_id = vote.user_id)
              or (friendship.addressee_id = uid and friendship.requester_id = vote.user_id))
        )
      )
      and not exists (
        select 1 from public.blocks block
        where (block.blocker_id = uid and block.blocked_id = vote.user_id)
           or (block.blocked_id = uid and block.blocker_id = vote.user_id)
      )
      and (
        p_before_created_at is null
        or vote.created_at < p_before_created_at
        or (vote.created_at = p_before_created_at and vote.id < p_before_id)
      )
    order by vote.created_at desc, vote.id desc
    limit least(greatest(coalesce(p_limit, 40), 1), 50)
  ) page_rows;

  return result;
end;
$$;

revoke all on function public.get_poll_option_voters_page(uuid, uuid, text, integer, timestamptz, uuid)
  from public, anon;
grant execute on function public.get_poll_option_voters_page(uuid, uuid, text, integer, timestamptz, uuid)
  to authenticated;

create table if not exists public.media_objects_pending_delete (
  id uuid primary key default gen_random_uuid(),
  bucket_id text not null,
  object_path text not null,
  created_at timestamptz not null default clock_timestamp(),
  claimed_at timestamptz,
  unique (bucket_id, object_path)
);

alter table public.media_objects_pending_delete enable row level security;
revoke all on table public.media_objects_pending_delete from public, anon, authenticated;

create index if not exists media_objects_pending_delete_claim_idx
  on public.media_objects_pending_delete (claimed_at, created_at, id);

create or replace function public.queue_deleted_post_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.user_event_id is null then return old; end if;
  insert into public.media_objects_pending_delete (bucket_id, object_path)
  select intent.bucket_id, intent.object_path
  from public.media_upload_intents intent
  where intent.user_event_id = old.user_event_id
    and intent.committed_at is not null
  on conflict (bucket_id, object_path) do nothing;
  return old;
end;
$$;

drop trigger if exists queue_deleted_post_media on public.posts;
create trigger queue_deleted_post_media
after delete on public.posts
for each row execute function public.queue_deleted_post_media();

create or replace function public.claim_pending_media_deletions(p_limit integer default 500)
returns table (id uuid, bucket_id text, object_path text)
language sql
security definer
set search_path = ''
as $$
  with claimed as (
    update public.media_objects_pending_delete pending
    set claimed_at = clock_timestamp()
    where pending.id in (
      select candidate.id from public.media_objects_pending_delete candidate
      where candidate.claimed_at is null
         or candidate.claimed_at < clock_timestamp() - interval '10 minutes'
      order by candidate.created_at, candidate.id
      limit least(greatest(coalesce(p_limit, 500), 1), 1000)
      for update skip locked
    )
    returning pending.id, pending.bucket_id, pending.object_path
  )
  select claimed.id, claimed.bucket_id, claimed.object_path from claimed;
$$;

create or replace function public.delete_pending_media_deletions(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_count integer;
begin
  delete from public.media_objects_pending_delete pending
  where pending.id = any(coalesce(p_ids, array[]::uuid[]));
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.claim_pending_media_deletions(integer)
  from public, anon, authenticated;
revoke all on function public.delete_pending_media_deletions(uuid[])
  from public, anon, authenticated;
grant execute on function public.claim_pending_media_deletions(integer) to service_role;
grant execute on function public.delete_pending_media_deletions(uuid[]) to service_role;
