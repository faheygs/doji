-- Narrow composition over existing definitions; preserve unrelated commands and ACLs.
begin;
set local lock_timeout = '2s';
do $install$
declare target_signature text; original text; changed text; needle text; replacement text; saved record;
begin
  foreach target_signature in array array[
    'public.enforce_os_push_policy()',
    'public.process_friend_fanout_event(uuid)',
    'public.update_own_profile(jsonb,text)',
    'public.claim_push_delivery_targets_batch_v2(uuid,jsonb,text,text,text,text,timestamp with time zone)'
  ] loop
    original:=pg_get_functiondef(target_signature::regprocedure);
    select * into saved from social_notification_private.originals o where o.signature=target_signature;
    if found then
      if original is distinct from saved.installed_definition then
        raise exception 'Intervening social notification dependency change: %',target_signature;
      end if;
      continue;
    end if;
    changed:=replace(original,E'\r\n',E'\n');
    if target_signature='public.enforce_os_push_policy()' then
      needle:='  allowed :=';
      replacement:=$policy$
  if new.event_type in ('notification.post_comments.grouped_v1','notification.late_friend_activity.grouped_v1') then
    if exists(select 1 from social_notification_private.batches b
      cross join social_notification_private.configuration c
      where c.singleton and c.enabled and b.outbox_id=new.id
        and b.id::text=new.payload->>'batchId' and b.recipient::text=new.payload->>'targetUserId'
        and b.subject=new.aggregate_id and new.available_at>=b.due_at
        and new.event_type=case b.kind when 'comments_on_posts' then 'notification.post_comments.grouped_v1'
          else 'notification.late_friend_activity.grouped_v1' end) then
      return new;
    end if;
    return null;
  end if;
  allowed :=$policy$;
    elsif target_signature='public.process_friend_fanout_event(uuid)' then
      needle:='  return affected;';
      replacement:=E'  perform social_notification_private.capture_completion(p_event_id);\n  return affected;';
    elsif target_signature='public.update_own_profile(jsonb,text)' then
      needle:='''doji_live'', ''friend_requests'', ''mentions_replies'', ''reviews_account'',';
      replacement:=needle||E'\n           ''comments_on_posts'', ''late_friend_participation'',';
    else
      needle:=E'    cross join boundary\n    where not exists (';
      replacement:=E'    cross join boundary\n    where (p_category not in (''comments_on_posts'',''late_friend_participation'')\n      or social_notification_private.claimable(p_event_id,target.user_id))\n    and not exists (';
    end if;
    if length(changed)-length(replace(changed,needle,''))<>length(needle) then
      raise exception 'Unexpected social notification dependency: %',target_signature;
    end if;
    changed:=replace(changed,needle,replacement);
    insert into social_notification_private.originals(signature,definition) values(target_signature,original);
    execute changed;
    update social_notification_private.originals o set installed_definition=pg_get_functiondef(target_signature::regprocedure)
      where o.signature=target_signature;
  end loop;
end;
$install$;
commit;
