-- Stop new staff handoffs without deleting requests, reports or decisions.
-- This does not reverse already-authorized moderation; use its appeal workflow.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
revoke execute on function public.admin_create_safety_report_v1(uuid,bigint,uuid,jsonb) from doji_employee;
do $$declare r record; begin
 for r in select * from public.safety_removal_bridge_rollback loop
  if md5(pg_get_functiondef(to_regprocedure(r.signature)))<>r.installed_hash then raise exception 'Rollback refused: newer function change %',r.signature; end if;
  execute r.original_definition;
 end loop;
end$$;
commit;
