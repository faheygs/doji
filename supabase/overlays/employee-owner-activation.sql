-- Explicitly approved owner only. Run after guarded authorization migration.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $$begin
 if not exists(select 1 from auth.users u join public.admin_employees e on e.id=u.id
   where u.id='ae62514b-d022-4845-9933-2d10689b5105'
     and u.email='gfahey@dojipro.com' and u.role='doji_employee'
     and u.raw_app_meta_data->>'account_type'='employee' and u.email_confirmed_at is not null
     and e.status='pending' and cardinality(e.roles)=0
     and not exists(select 1 from public.profiles where id=u.id)
     and exists(select 1 from auth.mfa_factors where user_id=u.id and factor_type='totp' and status='verified')) then
   raise exception 'Exact verified pending owner and MFA required';end if;
 if (select employee_only from public.admin_employee_cutover where singleton) then
   raise exception 'Bootstrap must precede cutover';end if;
 perform public.bootstrap_employee_owner_v1('ae62514b-d022-4845-9933-2d10689b5105',
   'Owner explicitly approved separate work-account super administrator activation after email, MFA and member-session verification.');
 insert into public.admin_audit_log(actor_id,actor_role,action,entity_type,entity_id,reason,request_id,metadata)
 values('ae62514b-d022-4845-9933-2d10689b5105','super_admin','employee.owner_bootstrapped','employee',
   'ae62514b-d022-4845-9933-2d10689b5105','Owner-approved work identity activation; personal account and sessions unchanged.',
   'employee-owner-bootstrap-20260926',jsonb_build_object('employeeId','ae62514b-d022-4845-9933-2d10689b5105',
   'priorPortalActorId','57f7d45d-d10a-4426-923b-dcdc6f2b1bbc','memberAccountChanged',false));
end$$;
commit;
