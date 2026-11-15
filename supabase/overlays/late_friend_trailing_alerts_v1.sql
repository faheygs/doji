-- Install with the deferral-aware relay. Delivery enablement remains separate.
begin;
set local lock_timeout='2s';
set local statement_timeout='10s';
create table if not exists social_notification_private.trailing_originals (
  signature text primary key, definition text not null, installed_definition text not null
);
revoke all on social_notification_private.trailing_originals from public,anon,authenticated,service_role;
do $patch$
declare target_signature text; original text; changed text; expected text; saved record;
begin
 foreach target_signature in array array[
  'social_notification_private.enqueue(text,uuid,uuid,uuid,uuid,timestamp with time zone)',
  'public.prepare_social_phone_alert_v1(uuid,uuid)',
  'public.mark_notification_attention_seen(jsonb)'
 ] loop
  original:=pg_get_functiondef(target_signature::regprocedure);
  select * into saved from social_notification_private.trailing_originals o where o.signature=target_signature;
  if found then
   if original is distinct from saved.installed_definition then raise exception 'Intervening trailing-alert change: %',target_signature;end if;
   continue;
  end if;
  expected:=case when target_signature like '%enqueue(%' then '6ac99d07f142edf3b334e1f6250fe53c'
    when target_signature like '%mark_notification%' then 'c0e676f4021c836a54755de9107347ee'
    else '643653cd65885639f159501ee49b95ad' end;
  if (select md5(replace(prosrc,E'\r\n',E'\n')) from pg_proc where oid=target_signature::regprocedure)<>expected then
   raise exception 'Unreviewed social-alert definition: %',target_signature;
  end if;
  changed:=replace(original,E'\r\n',E'\n');
  if target_signature like '%enqueue(%' then
   changed:=replace(changed,'stamp timestamptz:=clock_timestamp();','stamp timestamptz:=clock_timestamp(); next_due timestamptz;');
   changed:=replace(changed,$old$          on conflict do nothing;
      end if;
      return;$old$,$new$          on conflict do nothing;
        return;
      end if;
      -- Keep the bounded 100-source read; overflow starts another durable batch.
      if category<>'late_friend_participation' then return; end if;$new$);
   changed:=replace(changed,$old$    if stamp<greatest(batch.due_at,batch.sealed_at)+interval '5 minutes' then return; end if;$old$,
    $new$    if category<>'late_friend_participation' and stamp<greatest(batch.due_at,batch.sealed_at)+interval '5 minutes' then return; end if;$new$);
   changed:=replace(changed,'  insert into social_notification_private.batches(kind,recipient,subject,first_occurred_at,due_at)',
    $new$  next_due:=stamp+interval '30 seconds';
  if category='late_friend_participation' and batch.id is not null then
    next_due:=greatest(next_due,greatest(batch.due_at,batch.sealed_at)+interval '1 minute');
  end if;
  insert into social_notification_private.batches(kind,recipient,subject,first_occurred_at,due_at)$new$);
   changed:=replace(changed,$old$values(category,viewer,subject_id,occurred,stamp+interval '30 seconds')$old$,'values(category,viewer,subject_id,occurred,next_due)');
  elsif target_signature like '%mark_notification%' then
   -- Only the new optional observation watermark changes. Legacy callers keep
   -- their contract; new clients acknowledge the snapshot, not wall-clock arrival.
   changed:=replace(changed,E'    server_now,\n    server_now\n  from jsonb_array_elements(p_receipts) item',
    $new$    case when item ? 'observed_through' then
      least((item->>'observed_through')::timestamptz,server_now) else server_now end,
    server_now
  from jsonb_array_elements(p_receipts) item$new$);
   changed:=replace(changed,$old$      or length(trim(item ->> 'scope_id')) > 128$old$,$new$      or length(trim(item ->> 'scope_id')) > 128
      or (item ? 'observed_through' and (jsonb_typeof(item->'observed_through') is distinct from 'string'
        or length(item->>'observed_through')>40))$new$);
  else
   changed:=replace(changed,'latest_source uuid; latest_at timestamptz; result jsonb;','latest_source uuid; latest_at timestamptz; result jsonb; previous_dispatch timestamptz;');
   changed:=replace(changed,$old$begin
  select * into event$old$,$new$begin
  -- Same lock order as enqueue: stream, outbox, batch. A delayed worker must
  -- not dispatch two previously due batches together after recovery.
  select * into batch from social_notification_private.batches where outbox_id=p_event_id;
  if batch.kind='late_friend_participation' then
    perform pg_advisory_xact_lock(hashtextextended(batch.kind||':'||batch.recipient||':'||batch.subject,17));
  end if;
  select * into event$new$);
   changed:=replace(changed,$old$  if clock_timestamp()<batch.due_at then raise exception 'Social notification is not due'; end if;$old$,
    $new$  if batch.kind='late_friend_participation' and batch.sealed_at is null then
    select max(b.sealed_at) into previous_dispatch from social_notification_private.batches b
      where b.kind=batch.kind and b.recipient=batch.recipient and b.subject=batch.subject and b.id<>batch.id;
    if greatest(batch.due_at,previous_dispatch+interval '1 minute')>clock_timestamp() then
      update social_notification_private.batches set due_at=greatest(batch.due_at,previous_dispatch+interval '1 minute') where id=batch.id returning * into batch;
      -- No provider handoff has happened. Release this exact lease to the
      -- existing durable next-available wake, not a new timer or failed retry.
      update public.domain_event_outbox set available_at=batch.due_at,lease_id=null,leased_at=null
        where id=event.id and lease_id=p_lease_id;
      return jsonb_build_object('deferred',true,'eventId',event.id,'leaseId',p_lease_id,'availableAt',batch.due_at);
    end if;
  end if;
  if clock_timestamp()<batch.due_at then raise exception 'Social notification is not due'; end if;$new$);
  end if;
  if changed=original then raise exception 'Trailing patch did not apply';end if;
  execute changed;
  insert into social_notification_private.trailing_originals values(target_signature,original,pg_get_functiondef(target_signature::regprocedure));
 end loop;
end;
$patch$;
commit;
