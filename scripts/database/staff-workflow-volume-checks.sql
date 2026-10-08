-- Run inside the same rollback transaction as staff-workflow-volume.sql.
create temp table staff_volume_latency(kind text,filter text,state text,sample integer,elapsed_ms numeric);
do $$declare k text; f text; s text; started timestamptz; response jsonb; item jsonb;
 cursor_at timestamptz; cursor_key text; previous_at timestamptz; previous_key text;begin
 perform set_config('request.jwt.claims','{"sub":"98000000-0000-4000-8000-000000000001","role":"doji_employee","aal":"aal2"}',true);
 foreach k in array array['all','report','appeal','suggestion','business_application','external_intake','business_privacy'] loop
 foreach f in array array['all','mine','unassigned'] loop
 foreach s in array array['all','ready','waiting'] loop
 for n in 1..20 loop
  cursor_at:=case when n%2=0 then '2026-01-01'::timestamptz+interval '1200 seconds' end;
  cursor_key:=case when cursor_at is not null then 'suggestion:00000000-0000-4000-8000-000000000000' end;
  started:=clock_timestamp();
  response:=public.get_admin_staff_work_page_v1(k,f,s,25,cursor_at,cursor_key);
  insert into staff_volume_latency values(k,f,s,n,extract(epoch from clock_timestamp()-started)*1000);
  if jsonb_array_length(response->'items')>25 then raise exception 'Page bound exceeded';end if;
  if s='waiting' and k in ('report','appeal','suggestion') then
   if jsonb_array_length(response->'items')<>0 then raise exception 'Ready-only queue returned waiting item';end if;
  elsif jsonb_array_length(response->'items')<>25 then raise exception 'Expected full populated page: %,%,%',k,f,s;end if;
  previous_at:=cursor_at;previous_key:=cursor_key;
  for item in select value from jsonb_array_elements(response->'items') loop
   if k<>'all' and item->>'kind'<>k then raise exception 'Wrong source';end if;
   if s<>'all' and item->>'work_state'<>s then raise exception 'Wrong work state';end if;
   if f='mine' and item->>'assigned_to' is distinct from auth.uid()::text then raise exception 'Wrong owner';end if;
   if f='unassigned' and item->>'assigned_to' is not null then raise exception 'Assigned item in unassigned';end if;
   if previous_at is not null and ((item->>'at')::timestamptz,item->>'key')<=(previous_at,previous_key) then raise exception 'Non-monotonic cursor';end if;
   previous_at:=(item->>'at')::timestamptz;previous_key:=item->>'key';
  end loop;
 end loop;
 end loop;end loop;end loop;
end$$;
select jsonb_build_object('type','six-source-read','added_source_rows',30000,'samples',1260,'scenarios',jsonb_agg(summary order by kind,filter,state)) from (
 select kind,filter,state,jsonb_build_object('kind',kind,'filter',filter,'state',state,'samples',count(*),
 'median_ms',round((percentile_cont(.5) within group(order by elapsed_ms))::numeric,3),
 'p95_ms',round((percentile_cont(.95) within group(order by elapsed_ms))::numeric,3),'max_ms',round(max(elapsed_ms),3)) summary
 from staff_volume_latency group by kind,filter,state) results;

create temp table staff_trigger_latency(phase text,kind text,sample integer,elapsed_ms numeric,events integer);
do $$declare phase text; k text; q text; t record; started timestamptz; elapsed numeric; before_count integer; after_count integer;begin
 perform set_config('request.jwt.claims','{}',true);
 foreach phase in array array['absent','disabled','enabled'] loop
  -- Disable ONLY candidate triggers to measure the original source write baseline.
  for t in select tgrelid::regclass rel,tgname from pg_trigger where tgname like 'staff_workflow_%' loop
   execute format('alter table %s %s trigger %I',t.rel,case when phase='absent' then 'disable' else 'enable' end,t.tgname);
  end loop;
  update staff_workflow_private.settings set events_enabled=(phase='enabled');
  for k,q in select * from (values
   ('report',$q$update public.reports set notes='Synthetic benchmark update' where id='a1000000-0000-4000-8000-000000000005'$q$),
   ('appeal',$q$update public.moderation_appeals set statement='Synthetic benchmark changed statement' where id='a3000000-0000-4000-8000-000000000005'$q$),
   ('suggestion',$q$update public.challenge_suggestions set body='Synthetic benchmark changed body' where id='a4000000-0000-4000-8000-000000000005'$q$),
   ('business_application',$q$update business_private.applications set response='Synthetic benchmark update' where id='a6000000-0000-4000-8000-000000000005'$q$),
   ('business_privacy',$q$update business_private.privacy_cases set verification_reference='synthetic-volume-changed' where id='a7000000-0000-4000-8000-000000000005'$q$),
   ('external_intake',$q$update public.safety_removal_cases set public_message='Synthetic benchmark update' where id='a8000000-0000-4000-8000-000000000005'$q$)
  ) commands(kind,command) loop
   for n in 1..20 loop
    select count(*) into before_count from public.domain_event_outbox where topic like 'staff:workflow:%';
    begin
     started:=clock_timestamp();execute q;elapsed:=extract(epoch from clock_timestamp()-started)*1000;
     select count(*) into after_count from public.domain_event_outbox where topic like 'staff:workflow:%';
     if after_count-before_count<>(case when phase='enabled' then 1 else 0 end) then raise exception 'Unexpected event delta';end if;
     -- Subtransaction rollback restores row and outbox for every sample; no no-op/replay timing.
     raise exception using errcode='ZX001',message='synthetic sample rollback';
    exception when sqlstate 'ZX001' then null;end;
    insert into staff_trigger_latency values(phase,k,n,elapsed,after_count-before_count);
   end loop;
  end loop;
 end loop;
end$$;
select jsonb_build_object('type','source-write-trigger-cost','samples',360,'scenarios',jsonb_agg(summary order by phase,kind)) from (
 select phase,kind,jsonb_build_object('phase',phase,'kind',kind,'samples',count(*),'event_delta',min(events),
 'median_ms',round((percentile_cont(.5) within group(order by elapsed_ms))::numeric,3),
 'p95_ms',round((percentile_cont(.95) within group(order by elapsed_ms))::numeric,3),'max_ms',round(max(elapsed_ms),3)) summary
 from staff_trigger_latency group by phase,kind) results;
