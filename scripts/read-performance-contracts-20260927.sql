begin read only;
set local statement_timeout='5s';
set local lock_timeout='1s';
select now() as checked_at,
  has_table_privilege('authenticated','public.profiles','SELECT') as member_profile_table_select,
  has_column_privilege('authenticated','public.profiles','id','SELECT') as member_profile_id_select,
  has_column_privilege('authenticated','public.profiles','is_admin','SELECT') as member_profile_admin_select,
  has_table_privilege('authenticated','public.challenge_suggestions','SELECT') as member_suggestions_select,
  (select jsonb_agg(jsonb_build_object('name',policyname,'roles',roles,'qual',qual)) from pg_policies where schemaname='public' and tablename='challenge_suggestions' and cmd='SELECT') as suggestion_policies,
  (select jsonb_agg(jsonb_build_object('name',name,'setting',setting,'unit',unit)) from pg_settings where name in ('shared_buffers','work_mem','max_connections','track_io_timing','pg_stat_statements.track')) as settings,
  (select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock') as current_lock_waits;
rollback;
