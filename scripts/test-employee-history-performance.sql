update staff_workflow_private.settings set history_reads_enabled=true;
select set_config('request.jwt.claims','{"sub":"98000000-0000-4000-8000-000000000001","role":"doji_employee","aal":"aal2"}',true);
set local role doji_employee;
do $$declare state text; started timestamptz; samples double precision[]; elapsed double precision; p95 double precision; page jsonb; evidence jsonb:='[]';begin
 foreach state in array array['open','completed','all'] loop
  samples:='{}';
  for n in 1..20 loop
   started:=clock_timestamp();page:=public.get_admin_personal_work_page_v1('all',state,25);
   elapsed:=extract(epoch from clock_timestamp()-started)*1000;samples:=array_append(samples,elapsed);
   if jsonb_array_length(page->'items')<>25 then raise exception 'Volume page not full';end if;
  end loop;
  select percentile_cont(0.95) within group(order by x) into p95 from unnest(samples) x;
  if p95>250 then raise exception 'Local personal queue p95 budget exceeded: % ms',p95;end if;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('filter',state,'samples',20,'p95_ms',round(p95::numeric,2)));
 end loop;
 perform set_config('test.personal_performance',evidence::text,true);
end$$;
reset role;
select 'PERSONAL_TIMINGS:'||current_setting('test.personal_performance');
select 'PASS: 60 bounded personal-history reads over 30,000 six-source rows, each p95 below 250ms (local only)';
insert into public.app_announcements(id,title,body,enabled,starts_at,ends_at,created_at)
select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic volume','Not returned',n%10<>0,
 '2020-01-01'::timestamptz+n*interval '1 minute','2020-01-01'::timestamptz+(n+1)*interval '1 minute',
 '2020-01-01'::timestamptz+n*interval '1 second' from generate_series(1,5000) n;
insert into public.admin_announcement_state(announcement_id,state,actor_id)
select ('b2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n%10=0 then 'draft' else 'published' end,'98000000-0000-4000-8000-000000000001' from generate_series(1,5000) n;
analyze public.app_announcements;
analyze public.admin_announcement_state;
set local role doji_employee;
do $$declare filter text; started timestamptz; samples double precision[]; elapsed double precision; p95 double precision; page jsonb; evidence jsonb:='[]';begin
 foreach filter in array array['active','expired','all'] loop
  samples:='{}';
  for n in 1..20 loop
   started:=clock_timestamp();page:=public.get_admin_announcement_lifecycle_page_v1(filter,25);
   elapsed:=extract(epoch from clock_timestamp()-started)*1000;samples:=array_append(samples,elapsed);
   if jsonb_array_length(page->'items')<>25 then raise exception 'Announcement volume page not full';end if;
  end loop;
  select percentile_cont(0.95) within group(order by x) into p95 from unnest(samples) x;
  if p95>250 then raise exception 'Local announcement page p95 budget exceeded: % ms',p95;end if;
  evidence:=evidence||jsonb_build_array(jsonb_build_object('filter',filter,'samples',20,'p95_ms',round(p95::numeric,2)));
 end loop;
 perform set_config('test.announcement_performance',evidence::text,true);
end$$;
reset role;
select 'ANNOUNCEMENT_TIMINGS:'||current_setting('test.announcement_performance');
select 'PASS: 60 announcement-history reads over 5,000 records, each p95 below 250ms (local only)';
