-- Requires the qualified late-friend queue/deferral relay and dismissal overlays.
-- Changes only comment scheduling; never enables delivery or alters preferences.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
create table if not exists social_notification_private.comment_trailing_originals (
  signature text primary key, definition text not null, installed_definition text not null
);
revoke all on social_notification_private.comment_trailing_originals from public,anon,authenticated,service_role;
do $patch$
declare target_signature text; original text; changed text; expected text; body_hash text; saved record;
begin
 foreach target_signature in array array[
  'social_notification_private.enqueue(text,uuid,uuid,uuid,uuid,timestamp with time zone)',
  'public.prepare_social_phone_alert_v1(uuid,uuid)'
 ] loop
  original:=pg_get_functiondef(target_signature::regprocedure);
  select * into saved from social_notification_private.comment_trailing_originals o where o.signature=target_signature;
  if found then
   if original is distinct from saved.installed_definition then raise exception 'Intervening comment queue change: %',target_signature; end if;
   continue;
  end if;
  expected:=case when target_signature like '%enqueue(%' then 'f6a938a5ccfb88848c7351720a83b7cd'
    else 'f15c37bdf2731d9f00c8c690245e619b' end;
  changed:=replace(original,E'\r\n',E'\n');
  select md5(replace(prosrc,E'\r\n',E'\n')) into body_hash from pg_proc where oid=target_signature::regprocedure;
  -- The recorded Windows installation missed two multiline replacements. Admit
  -- only those exact predecessors, then require the canonical reviewed body.
  if target_signature like '%enqueue(%' and body_hash='5acc2719966ce4d972e240bcda3a5319' then
   changed:=replace(changed,E'          on conflict do nothing;\n      end if;\n      return;',
    E'          on conflict do nothing;\n        return;\n      end if;\n      -- Keep the bounded 100-source read; overflow starts another durable batch.\n      if category<>''late_friend_participation'' then return; end if;');
   execute changed;
  elsif target_signature like '%prepare_social_phone_alert_v1(%' and body_hash='05b516e06c1f9bf0e39e2bc25ed33252' then
   changed:=replace(changed,E'begin\n  select * into event',
    E'begin\n  -- Same lock order as enqueue: stream, outbox, batch. A delayed worker must\n  -- not dispatch two previously due batches together after recovery.\n  select * into batch from social_notification_private.batches where outbox_id=p_event_id;\n  if batch.kind=''late_friend_participation'' then\n    perform pg_advisory_xact_lock(hashtextextended(batch.kind||'':''||batch.recipient||'':''||batch.subject,17));\n  end if;\n  select * into event');
   execute changed;
  end if;
  if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid=target_signature::regprocedure)<>expected then
   raise exception 'Unreviewed comment queue dependency: %',target_signature;
  end if;
  if target_signature like '%enqueue(%' then
   changed:=replace(changed,'      if category<>''late_friend_participation'' then return; end if;','');
   changed:=replace(changed,E'    -- Suppress phone interruptions during cooldown; existing Activity Center events stay immediate.\n    if category<>''late_friend_participation'' and stamp<greatest(batch.due_at,batch.sealed_at)+interval ''5 minutes'' then return; end if;',
    '    -- New sources remain queued; spacing delays an alert without discarding it.');
   changed:=replace(changed,'if category=''late_friend_participation'' and batch.id is not null then',
    'if batch.id is not null then');
  else
   changed:=replace(changed,'if batch.kind=''late_friend_participation'' then','if batch.id is not null then');
   changed:=replace(changed,'if batch.kind=''late_friend_participation'' and batch.sealed_at is null then',
    'if batch.sealed_at is null then');
  end if;
  if changed=original or changed like '%category<>''late_friend_participation''%'
    or changed like '%if batch.kind=''late_friend_participation''%' then
   raise exception 'Comment trailing patch did not apply completely';
  end if;
  execute changed;
  insert into social_notification_private.comment_trailing_originals
    values(target_signature,original,pg_get_functiondef(target_signature::regprocedure));
 end loop;
end;
$patch$;
commit;
