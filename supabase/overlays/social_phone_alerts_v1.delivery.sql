-- Apply after social_phone_alerts_v1.sql, before bindings. No provider calls in SQL.
begin;
set local lock_timeout = '2s';
create or replace function social_notification_private.eligible(
  batch social_notification_private.batches, item social_notification_private.items
) returns boolean language sql stable security definer set search_path = '' as $$
  select item.actor_id<>batch.recipient and not item.direct_alert
    and exists(select 1 from public.profiles p where p.id=item.actor_id and p.is_banned is not true)
    and not public.users_are_blocked(item.actor_id,batch.recipient)
    and not exists(select 1 from public.notification_attention_state a
      where a.user_id=batch.recipient
        and a.scope_kind=case batch.kind when 'comments_on_posts' then 'comment' else 'daily_event' end
        and a.scope_id=case batch.kind when 'comments_on_posts' then item.source_id else batch.subject end::text
        and a.seen_at>=item.occurred_at)
    and case batch.kind when 'comments_on_posts' then exists(
      select 1 from public.comments c join public.posts p on p.id=c.post_id
      left join public.comments parent on parent.id=c.reply_to_comment_id
      where c.id=item.source_id and c.user_id=item.actor_id and p.id=batch.subject
        and p.user_id=batch.recipient and p.is_community_poll is not true
        and c.moderation_status='visible' and public.can_view_full_post(p.id,batch.recipient)
        and not exists(select 1 from public.reports r where r.reporter_id=batch.recipient
          and r.comment_id=c.id and r.status='pending')
        -- Mentions are inserted after the comment trigger in the same command.
        -- Keep the captured direct-alert marker as well as current relationships,
        -- so an edit cannot turn an already-notified mention into a second push.
        and parent.user_id is distinct from batch.recipient
        and not exists(select 1 from public.comment_mentions m
          where m.comment_id=c.id and m.mentioned_user_id=batch.recipient)
      ) else exists(
        select 1 from public.user_events ue join public.daily_events e on e.id=ue.daily_event_id
        join public.challenges challenge on challenge.id=e.challenge_id
        where ue.id=item.source_id and ue.user_id=item.actor_id and ue.daily_event_id=batch.subject
          and ue.status in ('completed','late') and ue.completed_at>=e.closes_at
          and public.can_access_daily_event(e.id,batch.recipient)
          and exists(select 1 from public.friendships f where f.status='accepted' and
            ((f.requester_id=item.actor_id and f.addressee_id=batch.recipient) or
             (f.addressee_id=item.actor_id and f.requester_id=batch.recipient)))
          and case when challenge.type='poll' then exists(
            select 1 from public.poll_votes v where v.user_event_id=ue.id and v.user_id=ue.user_id
              and v.moderation_status='visible' and not exists(select 1 from public.reports r
                where r.reporter_id=batch.recipient and r.poll_vote_id=v.id and r.status='pending'))
          else exists(select 1 from public.posts p where p.user_event_id=ue.id and p.user_id=ue.user_id
            and p.is_community_poll is not true and p.moderation_status='visible'
            and not exists(select 1 from public.reports r where r.reporter_id=batch.recipient
              and r.post_id=p.id and r.status='pending')) end
      ) end;
$$;

create or replace function public.prepare_social_phone_alert_v1(p_event_id uuid,p_lease_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare batch social_notification_private.batches; event public.domain_event_outbox;
  sources uuid[]; actor_count integer; event_count integer; actor_name text;
  latest_source uuid; latest_at timestamptz; result jsonb;
begin
  select * into event from public.domain_event_outbox q where q.id=p_event_id for update;
  if event.lease_id is distinct from p_lease_id or p_lease_id is null or event.published_at is not null then
    raise exception 'Social notification lease lost';
  end if;
  select * into batch from social_notification_private.batches b where b.outbox_id=event.id for update;
  if batch.id is null or not (select enabled from social_notification_private.configuration where singleton)
    or not social_notification_private.preference(batch.recipient,batch.kind)
    or batch.first_occurred_at+interval '5 minutes'<=clock_timestamp() then return null; end if;
  if clock_timestamp()<batch.due_at then raise exception 'Social notification is not due'; end if;
  -- At most 100 source IDs, never an unbounded comments/post scan or message-body read.
  with eligible as materialized (
    select i.* from social_notification_private.items i where i.batch_id=batch.id
      and social_notification_private.eligible(batch,i)
  ) select array_agg(source_id order by occurred_at desc,source_id),count(*),count(distinct actor_id),max(occurred_at)
    into sources,event_count,actor_count,latest_at from eligible;
  update social_notification_private.batches set sealed_at=coalesce(sealed_at,clock_timestamp()),
    prepared_sources=coalesce(sources,'{}'::uuid[]) where id=batch.id;
  if event_count=0 then return null; end if;
  latest_source:=sources[1];
  select left(coalesce(nullif(trim(p.display_name),''),nullif(trim(p.username),''),'Someone'),80)
    into actor_name from social_notification_private.items i join public.profiles p on p.id=i.actor_id
    where i.batch_id=batch.id and i.source_id=latest_source;
  result:=jsonb_build_object('sendPush',true,'batchId',batch.id,'targetUserId',batch.recipient,
    'occurredAt',batch.first_occurred_at,'attentionOccurredAt',latest_at,
    'preferenceKey',batch.kind,'title','Doji','actorCount',actor_count,'eventCount',event_count);
  if batch.kind='comments_on_posts' then
    return result||jsonb_build_object('type','COMMENT','postId',batch.subject,'commentId',latest_source,
      'body',case when actor_count>1 then actor_name||' and '||(actor_count-1)||
          case when actor_count=2 then ' other commented on your post' else ' others commented on your post' end
        when event_count>1 then actor_name||' added '||event_count||' comments to your post'
        else actor_name||' commented on your post' end);
  end if;
  return result||jsonb_build_object('type','FRIEND_POST','dailyEventId',batch.subject,
    'body',case when actor_count>1 then actor_name||' and '||(actor_count-1)||
        case when actor_count=2 then ' other participated in today''s Doji' else ' others participated in today''s Doji' end
      else actor_name||' participated in today''s Doji' end);
end;
$$;

-- Final database fence immediately before the existing per-installation claims.
create or replace function social_notification_private.claimable(event_id uuid,viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select c.enabled and b.recipient=viewer
    and social_notification_private.preference(viewer,b.kind)
    and b.first_occurred_at+interval '5 minutes'>clock_timestamp()
    and cardinality(b.prepared_sources)>0 and b.sealed_at is not null
    and not exists(select 1 from social_notification_private.items i
      where i.batch_id=b.id and i.source_id=any(b.prepared_sources)
        and social_notification_private.eligible(b,i) is not true)
    from social_notification_private.batches b cross join social_notification_private.configuration c
    where b.outbox_id=event_id and c.singleton),false);
$$;
revoke all on all functions in schema social_notification_private from public,anon,authenticated,service_role;
revoke all on function public.prepare_social_phone_alert_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.prepare_social_phone_alert_v1(uuid,uuid) to service_role;
commit;
