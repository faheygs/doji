-- A post cascade deletes its comments after the parent post has disappeared.
-- Do not recreate a sharded counter for that missing parent during the cascade.
create or replace function public.update_comment_count()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_post uuid := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
declare actor uuid := case when tg_op = 'DELETE' then old.user_id else new.user_id end;
declare delta integer := case when tg_op = 'DELETE' then -1 else 1 end;
declare community boolean;
begin
  select coalesce(post.is_community_poll, false) into community
  from public.posts post where post.id = target_post;

  if not found then return null; end if;

  insert into public.post_engagement_shards (post_id, shard, comment_count)
  values (target_post, mod((hashtextextended(actor::text, 0) & 2147483647), 128)::smallint,
    greatest(delta, 0))
  on conflict (post_id, shard) do update set comment_count =
    greatest(public.post_engagement_shards.comment_count + delta, 0);
  if not community then
    update public.posts set comment_count = greatest(comment_count + delta, 0)
    where id = target_post;
  end if;
  return null;
end;
$$;

-- Snapshot reads stamp every user post with its occurrence. Keep the ownership
-- constraint aligned with that write contract instead of rejecting valid posts.
alter table public.posts drop constraint if exists posts_user_or_community_check;
alter table public.posts add constraint posts_user_or_community_check check (
  (is_community_poll = true and daily_event_id is not null
    and user_event_id is null and user_id is null)
  or
  (is_community_poll = false and daily_event_id is not null
    and user_event_id is not null and user_id is not null)
);

-- A delayed alarm recovery may move closes_at forward. Keep already-prepared
-- pending participant timers synchronized with the authoritative event window.
create or replace function public.sync_pending_event_expiry()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.closes_at is not null then
    update public.user_events
    set expires_at = new.closes_at
    where daily_event_id = new.id and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_pending_event_expiry_after_activation on public.daily_events;
create trigger sync_pending_event_expiry_after_activation
after update of activated_at, closes_at on public.daily_events
for each row execute function public.sync_pending_event_expiry();
