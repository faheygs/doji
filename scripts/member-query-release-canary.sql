-- Bounded read-only check of the exact installed app request. Never sends events.
begin read only;
set local statement_timeout='5s';
set local lock_timeout='1s';
do $check$
declare response jsonb; started timestamptz; elapsed numeric;
begin
 if (select count(*) from supabase_migrations.schema_migrations
     where version in ('20260928040000','20260928040100','20260928040200'))<>3 then
  raise exception 'Release history incomplete';
 end if;
 if has_function_privilege('authenticated','public.sync_comment_mentions(uuid,text,uuid)','execute')
   or has_function_privilege('anon','public.sync_comment_mentions(uuid,text,uuid)','execute')
   or has_function_privilege('doji_employee','public.sync_comment_mentions(uuid,text,uuid)','execute') then
  raise exception 'Mention helper permission regression';
 end if;
 perform set_config('request.jwt.claims','{"sub":"57f7d45d-d10a-4426-923b-dcdc6f2b1bbc","role":"authenticated","aal":"aal1"}',true);
 set local role authenticated;
 started:=clock_timestamp();
 response:=public.get_notification_center_snapshot(now()-interval '30 days',200);
 elapsed:=extract(epoch from clock_timestamp()-started)*1000;
 if response is null then raise exception 'Null notification snapshot';end if;
 reset role;
 perform set_config('query_release.canary',jsonb_build_object(
  'at',clock_timestamp(),'snapshot_returned',true,'request_days',30,'request_limit',200,
  'database_elapsed_ms',elapsed,'response_type',jsonb_typeof(response),
  'migration_records',3,'helper_permissions_preserved',true,
  'production_writes',0,'provider_requests',0)::text,true);
end $check$;
select current_setting('query_release.canary')::jsonb as checks;
rollback;
