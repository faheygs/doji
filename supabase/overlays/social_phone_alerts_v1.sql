-- Preparation only. Install before the matching relay/client; activation is separate.
begin;
set local lock_timeout = '2s';
create schema if not exists social_notification_private;
revoke all on schema social_notification_private from public, anon, authenticated, service_role;

create table if not exists social_notification_private.configuration (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false
);
insert into social_notification_private.configuration values (true, false) on conflict do nothing;

create table if not exists social_notification_private.batches (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('comments_on_posts', 'late_friend_participation')),
  recipient uuid not null references public.profiles(id) on delete cascade,
  subject uuid not null,
  first_occurred_at timestamptz not null,
  due_at timestamptz not null,
  sealed_at timestamptz,
  prepared_sources uuid[],
  outbox_id uuid not null unique default gen_random_uuid()
    references public.domain_event_outbox(id) on delete cascade deferrable initially deferred
);
create index if not exists social_notification_stream_idx
  on social_notification_private.batches(kind, recipient, subject, due_at desc);
create table if not exists social_notification_private.items (
  batch_id uuid not null references social_notification_private.batches(id) on delete cascade,
  source_id uuid not null,
  actor_id uuid not null,
  occurred_at timestamptz not null,
  direct_alert boolean not null default false,
  primary key (batch_id, source_id)
);
create index if not exists social_notification_source_idx on social_notification_private.items(source_id,batch_id);
create table if not exists social_notification_private.originals (
  signature text primary key,
  definition text not null,
  installed_definition text
);
revoke all on all tables in schema social_notification_private
  from public, anon, authenticated, service_role;

create or replace function social_notification_private.preference(viewer uuid, category text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select p.is_banned is not true
    and p.notification_preferences->'push_enabled' is distinct from 'false'::jsonb
    and p.notification_preferences->category = 'true'::jsonb
    and p.notification_preferences->case when category='comments_on_posts' then 'comment'
      else 'friend_post' end is distinct from 'false'::jsonb
    from public.profiles p where p.id=viewer), false);
$$;

create or replace function social_notification_private.enqueue(
  category text, viewer uuid, subject_id uuid, source_id uuid, actor uuid, occurred timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare batch social_notification_private.batches; stamp timestamptz:=clock_timestamp();
begin
  if not (select enabled from social_notification_private.configuration where singleton)
    or not social_notification_private.preference(viewer, category)
    or viewer=actor or occurred is null or occurred>stamp
    or occurred+interval '5 minutes'<=stamp+interval '30 seconds' then return; end if;
  -- Serialize only this recipient/subject. Fanout happens off the member write path.
  perform pg_advisory_xact_lock(hashtextextended(category||':'||viewer||':'||subject_id, 17));
  insert into public.notification_once_keys(delivery_key)
    values ('social-phone-v1:'||category||':'||viewer||':'||source_id) on conflict do nothing;
  if not found then return; end if;
  select * into batch from social_notification_private.batches b
    where b.kind=category and b.recipient=viewer and b.subject=subject_id
    order by b.due_at desc limit 1 for update;
  if batch.id is not null then
    if batch.sealed_at is null and stamp<batch.due_at then
      if (select count(*) from social_notification_private.items i where i.batch_id=batch.id)<100 then
        insert into social_notification_private.items(batch_id,source_id,actor_id,occurred_at) values(batch.id,source_id,actor,occurred)
          on conflict do nothing;
      end if;
      return;
    end if;
    -- Suppress phone interruptions during cooldown; existing Activity Center events stay immediate.
    if stamp<greatest(batch.due_at,batch.sealed_at)+interval '5 minutes' then return; end if;
  end if;
  insert into social_notification_private.batches(kind,recipient,subject,first_occurred_at,due_at)
    values(category,viewer,subject_id,occurred,stamp+interval '30 seconds') returning * into batch;
  insert into social_notification_private.items(batch_id,source_id,actor_id,occurred_at) values(batch.id,source_id,actor,occurred);
  insert into public.domain_event_outbox(id,topic,event_type,aggregate_id,payload,idempotency_key,available_at)
    values(batch.outbox_id,'user:'||viewer||':events',
      case category when 'comments_on_posts' then 'notification.post_comments.grouped_v1'
        else 'notification.late_friend_activity.grouped_v1' end,
      subject_id,jsonb_build_object('version',1,'batchId',batch.id,'targetUserId',viewer,
        'sendPush',true,'occurredAt',occurred,'commentId',case when category='comments_on_posts' then source_id end,
        'postId',case when category='comments_on_posts' then subject_id end,
        'dailyEventId',case when category='late_friend_participation' then subject_id end),
        'social-phone-batch:'||batch.id,batch.due_at);
end;
$$;

-- Called off the interactive command, from the existing durable fanout worker.
create or replace function social_notification_private.capture_completion(event_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare occurrence public.user_events; friend record;
begin
  if not (select enabled from social_notification_private.configuration where singleton) then return; end if;
  select ue.* into occurrence from public.domain_event_outbox q
    join public.user_events ue on ue.id=(q.payload->>'aggregateId')::uuid
    join public.daily_events e on e.id=ue.daily_event_id
    where q.id=event_id and q.event_type='fanout.friend_completion'
      and ue.status in ('completed','late') and ue.completed_at>=e.closes_at;
  if occurrence.id is null then return; end if;
  for friend in select user_id from public.accepted_friend_ids(occurrence.user_id) loop
    if public.can_access_daily_event(occurrence.daily_event_id,friend.user_id)
      and not public.users_are_blocked(occurrence.user_id,friend.user_id) then
      perform social_notification_private.enqueue('late_friend_participation',friend.user_id,
        occurrence.daily_event_id,occurrence.id,occurrence.user_id,occurrence.completed_at);
    end if;
  end loop;
end;
$$;

create or replace function social_notification_private.capture_comment()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id uuid;
begin
  if not (select enabled from social_notification_private.configuration where singleton) then return new; end if;
  select p.user_id into owner_id from public.posts p where p.id=new.post_id
    and p.is_community_poll is not true and p.user_id<>new.user_id;
  if owner_id is not null then
    if exists(select 1 from public.comments c where c.id=new.reply_to_comment_id and c.user_id=owner_id) then
      return new;
    end if;
    perform social_notification_private.enqueue('comments_on_posts',owner_id,
      new.post_id,new.id,new.user_id,new.created_at);
  end if;
  return new;
end;
$$;
drop trigger if exists social_phone_comment_v1 on public.comments;
create trigger social_phone_comment_v1 after insert on public.comments
  for each row execute function social_notification_private.capture_comment();

create or replace function social_notification_private.capture_mention()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update social_notification_private.items i set direct_alert=true
    from social_notification_private.batches b
    where i.batch_id=b.id and i.source_id=new.comment_id
      and b.kind='comments_on_posts' and b.recipient=new.mentioned_user_id;
  return new;
end;
$$;
drop trigger if exists social_phone_mention_v1 on public.comment_mentions;
create trigger social_phone_mention_v1 after insert on public.comment_mentions
  for each row execute function social_notification_private.capture_mention();

create or replace function public.get_social_phone_alert_capabilities_v1()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  return jsonb_build_object('enabled',(select enabled from social_notification_private.configuration where singleton));
end;
$$;
revoke all on function public.get_social_phone_alert_capabilities_v1() from public,anon,authenticated,service_role;
grant execute on function public.get_social_phone_alert_capabilities_v1() to authenticated;
revoke all on all functions in schema social_notification_private from public,anon,authenticated,service_role;
commit;
