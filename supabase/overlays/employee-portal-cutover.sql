-- Run only after employee-capable Worker, realtime and portal deployment checks.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$begin
 if not exists(select 1 from public.admin_employees e join auth.users u on u.id=e.id
   where e.id='ae62514b-d022-4845-9933-2d10689b5105' and e.status='active'
     and 'super_admin'=any(e.roles) and u.email='gfahey@dojipro.com' and u.role='doji_employee') then
   raise exception 'Approved owner mapping missing';end if;
 perform public.activate_employee_portal_v1();
 insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id,metadata)
 select 'ae62514b-d022-4845-9933-2d10689b5105','super_admin','employee.portal_activated','employee',
   'ae62514b-d022-4845-9933-2d10689b5105','Owner-approved employee-only portal cutover after release regression checks.',
   'employee-portal-cutover-20260926','{"employeeOnly":true,"memberSessionsChanged":false}'::jsonb
 where not exists(select 1 from public.admin_audit_log where request_id='employee-portal-cutover-20260926');
end$$;
commit;
