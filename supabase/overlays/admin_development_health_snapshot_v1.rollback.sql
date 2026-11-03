begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
lock table admin_development_private.routes in exclusive mode;
do $$begin
 if not exists(select 1 from admin_development_private.routes where name='get_admin_health_snapshot_v1'
  and target='admin_development_private.health_snapshot_v1(boolean)'::regprocedure
  and fields=array['p_summary'] and types=array['boolean'] and defaults='{}'::jsonb) then
  raise exception 'Development snapshot route drifted';end if;
end$$;
delete from admin_development_private.routes where name='get_admin_health_snapshot_v1';
drop function admin_development_private.health_snapshot_v1(boolean);
commit;
