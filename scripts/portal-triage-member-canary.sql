-- Read-only member/employee queries. Zero feed/comment rows are reported, not
-- claimed as successful playback/content visibility. No synthetic production data.
begin read only;
set local statement_timeout='8s';
do $check$
declare result jsonb; subject uuid:='57f7d45d-d10a-4426-923b-dcdc6f2b1bbc'; event_id uuid; post_id uuid; feed_rows int; comment_rows int;
begin
 select id into event_id from public.daily_events where fires_at<=clock_timestamp() order by fires_at desc limit 1;
 if event_id is null then raise exception 'No daily event for bounded member read check'; end if;
 select id into post_id from public.posts where daily_event_id=event_id order by created_at desc limit 1;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',subject,'role','authenticated','aal','aal1')::text,true);
 set local role authenticated;
 result:=jsonb_build_object('member_profile',public.get_own_profile() is not null,
   'member_realtime',public.get_realtime_token_capabilities()->>'userId'=subject::text,
   'member_employee_directory_denied',not has_function_privilege('authenticated','public.get_admin_employee_directory_v1()','execute'));
 perform public.get_notification_center_snapshot(now()-interval '1 day',1);
 select count(*) into feed_rows from public.get_feed_page_snapshot_v2(event_id,'everyone',1,null,null);
 select count(*) into comment_rows from public.get_comment_thread_snapshot(coalesce(post_id,'00000000-0000-0000-0000-000000000000'::uuid),'everyone',null,null,1);
 reset role;
 perform set_config('request.jwt.claims','{"sub":"ae62514b-d022-4845-9933-2d10689b5105","role":"doji_employee","aal":"aal2"}',true);
 set local role doji_employee;
 result:=result||jsonb_build_object('employee_session',public.get_admin_portal_session_v3()->'roles' ? 'super_admin',
   'employee_queue',public.get_admin_work_queue_page_v1(1) is not null,
   'employee_member_profile_denied',not has_function_privilege('doji_employee','public.get_own_profile()','execute'));
 reset role;
 if exists(select 1 from jsonb_each(result) where value is distinct from 'true'::jsonb) then raise exception 'Member/staff canary failed: %',result; end if;
 perform set_config('triage_release.canary',jsonb_build_object('checks',result,'feed_rpc_rows',feed_rows,'comment_rows',comment_rows,'existing_post_available',post_id is not null)::text,true);
end $check$;
select current_setting('triage_release.canary')::jsonb as checks;
rollback;
