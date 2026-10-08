-- Local synthetic benchmark only; caller wraps this entire file in a rollback.
insert into public.challenge_suggestions(id,user_id,kind,body,body_hash,status,created_at)
select gen_random_uuid(),'91000000-0000-4000-8000-000000000001','question','Synthetic queue performance fixture',
 md5('staff-performance-'||n),case when n<=2500 then 'pending' else 'rejected' end,
 '2026-01-01'::timestamptz+n*interval '1 second' from generate_series(1,5000) n;
insert into business_private.accounts(id) select ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5000) n;
insert into business_private.applications(id,applicant_id,state,created_at)
select gen_random_uuid(),('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n<=2500 then 'pending' else 'declined' end,
 '2026-01-01'::timestamptz+n*interval '1 second' from generate_series(1,5000) n;
analyze public.challenge_suggestions;
analyze business_private.applications;
create temp table staff_latency(filter text,sample integer,elapsed_ms numeric);
do $$declare started timestamptz; response jsonb; cursor_at timestamptz; cursor_key text; filter text; begin
 perform set_config('request.jwt.claims','{"sub":"98000000-0000-4000-8000-000000000001","role":"doji_employee","aal":"aal2"}',true);
 foreach filter in array array['all','mine','unassigned'] loop
 cursor_at:=null;cursor_key:=null;
 for n in 1..20 loop
  started:=clock_timestamp();
  response:=public.get_admin_owned_work_page_v1('all',filter,25,cursor_at,cursor_key);
  insert into staff_latency values(filter,n,extract(epoch from clock_timestamp()-started)*1000);
  if jsonb_array_length(response->'items')>25 or (filter<>'mine' and jsonb_array_length(response->'items')<>25) then raise exception 'Unexpected benchmark page size'; end if;
  cursor_at:=(response#>>'{next_cursor,at}')::timestamptz;
  cursor_key:=response#>>'{next_cursor,key}';
 end loop;
 end loop;
end$$;
select jsonb_agg(summary order by filter) from (
select filter,jsonb_build_object('filter',filter,'fixture_rows',10002,'samples',count(*),'page_size',25,
 'min_ms',round(min(elapsed_ms),3),'max_ms',round(max(elapsed_ms),3),
 'median_ms',round((percentile_cont(0.5) within group(order by elapsed_ms))::numeric,3),
 'p95_ms',round((percentile_cont(0.95) within group(order by elapsed_ms))::numeric,3)) summary from staff_latency group by filter) results;
