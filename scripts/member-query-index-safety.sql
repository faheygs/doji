select jsonb_build_object(
 'statement_timeout',current_setting('statement_timeout'),
 'lock_timeout',current_setting('lock_timeout'),
 'database_bytes',pg_database_size(current_database()),
 'old_transactions',(select count(*) from pg_stat_activity where backend_type='client backend' and xact_start<clock_timestamp()-interval '30 seconds'),
 'index_builds',(select count(*) from pg_stat_progress_create_index),
 'lock_waits',(select count(*) from pg_stat_activity where backend_type='client backend' and wait_event_type='Lock'),
 'migration_exists',exists(select 1 from supabase_migrations.schema_migrations where version='20260928040000')
) as safety;
