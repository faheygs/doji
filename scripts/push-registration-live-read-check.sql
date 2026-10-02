-- Read-only SQL canary; does not mint sessions or register real push tokens.
begin read only;
set local statement_timeout='8s';
do $check$
declare result jsonb; subject uuid := '57f7d45d-d10a-4426-923b-dcdc6f2b1bbc'; event_id uuid; post_id uuid;
begin
 select daily_event_id,id into event_id,post_id from public.posts where user_id=subject order by created_at desc limit 1;
 if event_id is null or post_id is null then raise exception 'Member canary content unavailable'; end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated','aal','aal1')::text,true);
 set local role authenticated;
 result:=jsonb_build_object(
   'member_profile',public.get_own_profile() is not null,
   'member_realtime',public.get_realtime_token_capabilities()->>'userId'=subject::text,
   'member_notifications',public.get_notification_center_snapshot(now()-interval '1 day',1) is not null,
   'member_employee_directory_denied',not has_function_privilege('authenticated','public.get_admin_employee_directory_v1()','execute'));
 if event_id is not null then result:=result||jsonb_build_object('member_feed',public.get_feed_page_snapshot_v2(event_id,'everyone',1,null,null) is not null); end if;
 if post_id is not null then result:=result||jsonb_build_object('member_comments',public.get_comment_thread_snapshot(post_id,'everyone',null,null,1) is not null); end if;
 reset role;
 perform set_config('request.jwt.claims','{"sub":"ae62514b-d022-4845-9933-2d10689b5105","role":"doji_employee","aal":"aal2"}',true);
 set local role doji_employee;
 result:=result||jsonb_build_object(
   'employee_session',public.get_admin_portal_session_v3()->'roles' ? 'super_admin',
   'employee_queue',public.get_admin_work_queue_page_v1(1) is not null,
   'employee_member_profile_denied',not has_function_privilege('doji_employee','public.get_own_profile()','execute'));
 reset role;
 result:=result||jsonb_build_object('migration_recorded',exists(select 1 from supabase_migrations.schema_migrations where version='20260926050000' and name='skip_unchanged_push_profile_update'));
 if exists(select 1 from jsonb_each(result) where value is distinct from 'true'::jsonb) then raise exception 'Release canary failed: %',result; end if;
end $check$;
-- Management API returns the final SELECT only. These success markers are reached
-- only after every actual read/access assertion in the preceding block succeeds.
select jsonb_build_object('member_profile',true,'member_realtime',true,'member_notifications',true,
  'member_feed',true,'member_comments',true,'member_employee_directory_denied',true,
  'employee_session',true,'employee_queue',true,'employee_member_profile_denied',true,'migration_recorded',true) as checks;
rollback;
