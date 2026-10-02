import {employeeEvidenceSetup} from './test-employee-local-evidence.mjs';
import {execFileSync} from 'node:child_process';
import {container} from './employee-test-runtime.mjs';
import {readFileSync} from 'node:fs';
const draft=readFileSync('docs/drafts/20260926011000_employee_portal_authorization.sql','utf8');
const installed=execFileSync('C:/Program Files/RedHat/Podman/podman.exe',['exec',container,'psql','-X','-U','postgres','-d','postgres','-At','-c',"select to_regclass('public.admin_employee_rate_limits') is not null;"],{encoding:'utf8'}).trim()==='t';
const limits=installed?'':draft.slice(draft.indexOf('-- BEGIN EMPLOYEE MODERATION RATE LIMITS'),draft.indexOf('-- END EMPLOYEE MODERATION RATE LIMITS'));
const source=`${employeeEvidenceSetup.replace('begin;',()=>`begin;\n${limits}`)}
select set_config('test.employee_claims',current_setting('request.jwt.claims'),true);
select set_config('request.jwt.claims','{}',true);
do $$begin if exists(select 1 from vault.secrets) then raise exception 'Local empty vault required';end if;end$$;
update public.profiles set is_admin=true where id=current_setting('test.member_id')::uuid;
insert into public.badges(id,name,emoji,description,criteria_type,criteria_value) values('first_one','First Steps','test','Synthetic completion fixture','completions',1) on conflict do nothing;
update public.user_events set status='completed' where user_id=current_setting('test.member_id')::uuid;
select public.activate_employee_portal_v1();
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal2')::text,true);
set local role authenticated;
do $$begin
 if public.admin_user_has_permission('portal.session') then raise exception 'Legacy portal authority survived cutover';end if;
 begin perform public.get_admin_portal_session_v3(); raise exception 'Member entered employee portal'; exception when insufficient_privilege then null;end;
 if public.get_own_profile() is null then raise exception 'Member profile unavailable';end if;
 perform public.get_feed_page_snapshot_v2('cccccccc-cccc-4ccc-8ccc-cccccccccccc','everyone');
 perform public.submit_comment('cccccccc-cccc-4ccc-8ccc-cccccccccccc','Synthetic member comment',null,'employee-cutover-member-comment');
 if not exists(select 1 from public.get_comment_thread_snapshot('cccccccc-cccc-4ccc-8ccc-cccccccccccc')) then raise exception 'Posted member comment unreadable';end if;
 if (public.get_realtime_token_capabilities(array['cccccccc-cccc-4ccc-8ccc-cccccccccccc']::uuid[])->>'userId') is null then raise exception 'Member realtime unavailable';end if;
end$$;
reset role;
select set_config('test.comment_id',id::text,true) from public.comments where idempotency_key='employee-cutover-member-comment';
select set_config('request.jwt.claims','{}',true);
insert into public.poll_options(id,challenge_id,text,is_other) values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','dddddddd-dddd-4ddd-8ddd-dddddddddddd','Other',true);
insert into public.poll_votes(id,user_id,challenge_id,option_id,custom_text,user_event_id,daily_event_id,idempotency_key)
 values('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',current_setting('test.member_id')::uuid,'dddddddd-dddd-4ddd-8ddd-dddddddddddd','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','Synthetic response','cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-cccc-4ccc-8ccc-cccccccccccc','employee-cutover-poll');
insert into public.reports(id,target_kind,comment_id,poll_vote_id,reporter_id,reported_user_id,reason) values
 ('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','comment',current_setting('test.comment_id')::uuid,null,current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid,'spam'),
 ('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','poll_response',null,'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid,'spam'),
 ('33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','profile_photo',null,null,current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid,'spam'),
 ('44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa','account',null,null,current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid,'other');
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
do $$declare id uuid;begin
 foreach id in array array['11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid,'44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid] loop
  perform public.get_admin_report_case_v2(id);
 end loop;
 begin perform public.get_own_profile();raise exception 'Employee member read allowed';exception when insufficient_privilege then null;end;
 begin perform public.get_realtime_token_capabilities();raise exception 'Employee member realtime allowed';exception when insufficient_privilege then null;end;
end$$;
select public.admin_decide_report_v3('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','remove_content','spam_scam','level_1','Synthetic comment moderation','Synthetic member warning notice','warning',null,'employee-cutover-comment-removal');
select public.admin_decide_report_v3('11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa','remove_content','spam_scam','level_1','Synthetic comment moderation','Synthetic member warning notice','warning',null,'employee-cutover-comment-removal');
select public.admin_decide_report_v3('22222222-aaaa-4aaa-8aaa-aaaaaaaaaaaa','remove_content','spam_scam','level_1','Synthetic poll moderation','Synthetic member warning notice','warning',null,'employee-cutover-poll-removal');
select public.admin_decide_report_v3('33333333-aaaa-4aaa-8aaa-aaaaaaaaaaaa','remove_profile_photo','spam_scam','level_1','Synthetic avatar moderation','Synthetic member warning notice','warning',null,'employee-cutover-avatar-removal');
select public.admin_decide_report_v3('44444444-aaaa-4aaa-8aaa-aaaaaaaaaaaa','no_violation','no_violation','none','Synthetic account clearance','Synthetic member clearance notice',null,null,'employee-cutover-account-clear');
reset role;
do $$begin
 if (select moderation_status from public.comments where id=current_setting('test.comment_id')::uuid)<>'removed' then raise exception 'Comment removal failed';end if;
 if (select moderation_status from public.poll_votes where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee')<>'removed' then raise exception 'Poll removal failed';end if;
 if (select request_count from public.admin_employee_rate_limits where employee_id=auth.uid() and action='comment')<>1 then raise exception 'Replay consumed an employee limit';end if;
 if exists(select 1 from public.api_rate_limit_buckets where user_id=auth.uid()) then raise exception 'Employee moderation touched member budget';end if;
end$$;
update public.admin_employees set roles=array['moderator'] where id=auth.uid();
set local role doji_employee;
do $$begin
 if public.admin_user_has_permission('legal.read') or public.admin_user_has_permission('admin.manage') then raise exception 'Moderator got owner authority';end if;
 if not public.admin_user_has_permission('moderation.write') then raise exception 'Moderator routine access missing';end if;
end$$;
reset role;
update public.admin_employees set roles=array['super_admin'] where id=auth.uid();
set local role doji_employee;
do $$declare email text;begin
 select item->>'username' into email from jsonb_array_elements(public.get_admin_employee_directory_v1()->'items') item where item->>'user_id'=current_setting('test.employee_claims')::jsonb->>'sub';
 -- Last-owner revocation must fail even though this caller is the super admin.
 begin
   perform public.admin_set_employee_role_v1(email,'super_admin',false,'Synthetic last owner protection','employee-last-owner-test');
   raise exception 'Last owner removal allowed';
 exception when raise_exception then if sqlerrm not like '%At least one employee super administrator%' then raise;end if;end;
end$$;
reset role;
rollback;`;
try {execFileSync('C:/Program Files/RedHat/Podman/podman.exe',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-At','-v','ON_ERROR_STOP=1'],{input:source,encoding:'utf8',stdio:['pipe','pipe','pipe']});
 console.log('PASS: employee cutover denies member portal access while member profile/feed/comment-write/comment-read/realtime survive; comment/poll/avatar/account commands and restricted-role boundaries pass. All rolled back.');
}catch(e){console.error(String(e.stderr));process.exitCode=1;}
