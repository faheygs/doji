-- Qualify with the snapshot-aware native client; legacy command arities remain unchanged.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
create table if not exists social_notification_private.group_dismissal_originals (
  signature text primary key, definition text not null, installed_definition text not null
);
revoke all on social_notification_private.group_dismissal_originals from public,anon,authenticated,service_role;

create or replace function social_notification_private.history_cutoff(viewer uuid,item_key text)
returns timestamptz language sql stable security definer set search_path='' as $$
 select greatest(
   coalesce((select cleared_at from public.notification_center_state where user_id=viewer),'-infinity'),
   coalesce((select dismissed_at from public.notification_dismissals where user_id=viewer and notification_key=item_key),'-infinity'));
$$;
revoke all on function social_notification_private.history_cutoff(uuid,text) from public,anon,authenticated,service_role;

create or replace function social_notification_private.history_visible(viewer uuid,item jsonb)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(case when item->>'kind'='challenge' then
   coalesce(item#>>'{userEvent,daily_event,activated_at}',item#>>'{userEvent,daily_event,prelive_at}',item->>'sortAt')
   else item->>'sortAt' end::timestamptz > case when item->>'kind'='friend_request' then
     coalesce((select dismissed_at from public.notification_dismissals where user_id=viewer and notification_key=item->>'key'),'-infinity')
   else social_notification_private.history_cutoff(viewer,item->>'key') end,false);
$$;
revoke all on function social_notification_private.history_visible(uuid,jsonb) from public,anon,authenticated,service_role;

-- Overloads preserve old binaries' server-action-time contract. New callers send
-- the source timestamp they saw, capped by the server, not their device clock.
create or replace function public.dismiss_notification(p_notification_key text,p_dismissed_at timestamptz,p_observed_through timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); through_at timestamptz; result_at timestamptz;
begin
 if viewer is null then raise exception 'Authentication required';end if;
 if p_notification_key is null or length(p_notification_key) not between 1 and 500
   or p_observed_through is null or not isfinite(p_observed_through) then raise exception 'Invalid notification snapshot';end if;
 through_at:=least(p_observed_through,clock_timestamp());
 perform public.sync_notification_center_state(null,null,jsonb_build_object(p_notification_key,through_at));
 select dismissed_at into result_at from public.notification_dismissals where user_id=viewer and notification_key=p_notification_key;
 return jsonb_build_object('notification_key',p_notification_key,'dismissed_at',result_at);
end;
$$;
create or replace function public.clear_notification_history(p_cleared_at timestamptz,p_observed_through timestamptz)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 if p_observed_through is null or not isfinite(p_observed_through) then raise exception 'Invalid notification snapshot';end if;
 result:=public.sync_notification_center_state(least(p_observed_through,clock_timestamp()),null,'{}'::jsonb);
 -- Preserve a dismissal of newer activity arriving before this clear completed.
 delete from public.notification_dismissals where user_id=auth.uid() and dismissed_at<=(result->>'cleared_at')::timestamptz;
 return result;
end;
$$;
revoke all on function public.dismiss_notification(text,timestamptz,timestamptz),public.clear_notification_history(timestamptz,timestamptz) from public,anon,authenticated,service_role;
grant execute on function public.dismiss_notification(text,timestamptz,timestamptz),public.clear_notification_history(timestamptz,timestamptz) to authenticated;

do $patch$
declare target_signature text; original text; changed text; saved record; expected text;
begin
 foreach target_signature in array array['public.get_notification_center_snapshot_without_post_context(timestamp with time zone,integer)',
   'public.get_notification_center_snapshot(timestamp with time zone,integer)',
   'social_notification_private.eligible(social_notification_private.batches,social_notification_private.items)'] loop
  original:=pg_get_functiondef(target_signature::regprocedure);
  select * into saved from social_notification_private.group_dismissal_originals o where o.signature=target_signature;
  if found then
   if original is distinct from saved.installed_definition then raise exception 'Intervening notification history change: %',target_signature;end if;
   continue;
  end if;
  expected:=case when target_signature like '%without_post_context%' then '7bd6ada58a092048af720fbe0f884b02'
   when target_signature like 'public.%' then '9a31b60ff2b5d3f92611707655bd36fe' else '1d02b52d7d86ebde221273ad67a8d2bd' end;
  if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid=target_signature::regprocedure)<>expected then
   raise exception 'Unreviewed notification history dependency: %',target_signature;
  end if;
  changed:=replace(original,E'\r\n',E'\n');
  if target_signature like '%without_post_context%' then
   changed:=replace(changed,'where r.user_id <> uid and r.user_id not in (select user_id from blocked)',
    'where r.user_id <> uid and r.user_id not in (select user_id from blocked) and r.created_at > social_notification_private.history_cutoff(uid,''reactions_post:''||r.post_id)');
   changed:=replace(changed,'and event.status in (''completed'', ''late'') and event.completed_at > p_since',
    'and event.status in (''completed'', ''late'') and event.completed_at > p_since and event.completed_at > social_notification_private.history_cutoff(uid,''friend_activity:''||event.daily_event_id)');
   changed:=replace(changed,'''daily_event_id'', p.daily_event_id, ''count'', count(*)::integer,',
    '''daily_event_id'', p.daily_event_id, ''historyThrough'', social_notification_private.history_cutoff(uid,''friend_activity:''||p.daily_event_id), ''count'', count(*)::integer,');
   changed:=replace(changed,'''count'', count(*)::integer, ''emojis'',',
    '''historyThrough'', social_notification_private.history_cutoff(uid,''reactions_post:''||r.post_id), ''count'', count(*)::integer, ''emojis'',');
   changed:=replace(changed,'where comment.user_id = uid and likes.user_id <> uid and likes.created_at > p_since',
    'where comment.user_id = uid and likes.user_id <> uid and likes.created_at > p_since and likes.created_at > social_notification_private.history_cutoff(uid,''comment_likes:''||comment.id)');
  elsif target_signature like 'public.%' then
   changed:=replace(changed,'select item from combined','select item from combined where social_notification_private.history_visible(auth.uid(),item)');
  else
   changed:=replace(changed,'select item.actor_id<>batch.recipient and not item.direct_alert',
    $new$select item.actor_id<>batch.recipient and not item.direct_alert
    and item.occurred_at>social_notification_private.history_cutoff(batch.recipient,
      case batch.kind when 'comments_on_posts' then 'comment:'||item.source_id else 'friend_activity:'||batch.subject end)$new$);
  end if;
  if changed=original then raise exception 'Notification history patch did not apply';end if;
  execute changed;
  insert into social_notification_private.group_dismissal_originals values(target_signature,original,pg_get_functiondef(target_signature::regprocedure));
 end loop;
end;
$patch$;
commit;
