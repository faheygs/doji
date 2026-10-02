-- Read calls take a short FOR SHARE staff authorization lock. Roll back the
-- transaction; no data-writing RPCs are invoked.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
select set_config('request.jwt.claims','{"sub":"ae62514b-d022-4845-9933-2d10689b5105","role":"doji_employee","aal":"aal2"}',true);
set local role doji_employee;
select set_config('business_release.reads',jsonb_build_object('application_queue',public.get_admin_business_applications_page_v1('pending',1,null,null),
 'privacy_queue',public.get_admin_business_privacy_page_v1('open',null,null))::text,true);
reset role;
do $$begin
 perform set_config('request.jwt.claims','{"sub":"ae62514b-d022-4845-9933-2d10689b5105","role":"doji_employee","aal":"aal1"}',true);
 set local role doji_employee;
 begin perform public.get_admin_business_applications_page_v1('pending',1,null,null);
  raise exception 'AAL1 staff unexpectedly admitted';
 exception when insufficient_privilege then null; end;
 begin perform public.get_admin_business_privacy_page_v1('open',null,null);
  raise exception 'AAL1 privacy staff unexpectedly admitted';
 exception when insufficient_privilege then null; end;
 reset role;
end$$;
select jsonb_build_object('reads',current_setting('business_release.reads')::jsonb,'permissions',jsonb_build_object(
 'member_cannot_read_business',not has_function_privilege('authenticated','public.get_admin_business_applications_page_v1(text,integer,timestamptz,uuid)','execute'),
 'anon_cannot_read_business',not has_function_privilege('anon','public.get_admin_business_applications_page_v1(text,integer,timestamptz,uuid)','execute'),
 'business_cannot_read_staff',not has_function_privilege('doji_business','public.get_admin_business_applications_page_v1(text,integer,timestamptz,uuid)','execute'),
 'signup_still_closed',(select not enabled and not registration_open from business_private.public_auth_settings where singleton),
 'realtime_still_off',(select not realtime_enabled from business_private.settings where singleton),
 'business_browser_role_not_admitted',not pg_has_role('authenticator','doji_business','member'),
 'employee_without_mfa_denied',true
)) as verification;
rollback;
