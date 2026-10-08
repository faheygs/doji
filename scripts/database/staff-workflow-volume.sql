-- Synthetic clean-room fixtures only. The caller rolls back this entire file.
update staff_workflow_private.settings set enabled=true,extended_enabled=true,events_enabled=false;
update business_private.privacy_settings set enabled=true;
select set_config('request.jwt.claims','{}',true);
create temp table staff_volume as
 select n,('a1000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid report,
 ('a2000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid decision,
 ('a3000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid appeal,
 ('a4000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid idea,
 ('a5000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid account,
 ('a6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid application,
 ('a7000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid privacy,
 ('a8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid intake,
 '2026-01-01'::timestamptz+n*interval '1 second' as stamp,
 case when n%5=0 then '98000000-0000-4000-8000-000000000001'::uuid
      when n%5=1 then '98000000-0000-4000-8000-000000000002'::uuid end owner
 from generate_series(1,5000) n;
insert into public.reports(id,reported_user_id,reporter_id,reason,target_kind,status,created_at)
 select report,'91000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
 'spam_scam','account',case when n<=2500 then 'pending' else 'dismissed' end,stamp from staff_volume;
insert into public.admin_report_triage(report_id,assigned_to,queue)
 select report,owner,case when n%4=0 then 'restricted_safety' else 'moderation' end from staff_volume
 on conflict(report_id) do update set assigned_to=excluded.assigned_to,queue=excluded.queue;
insert into public.moderation_decisions(id,report_id,affected_user_id,content_kind,action,policy_code,severity,rationale,user_notice,decided_by)
 select decision,report,'91000000-0000-4000-8000-000000000001','account','no_violation','no_violation','none',
 'Synthetic benchmark rationale','Synthetic benchmark member notice','98000000-0000-4000-8000-000000000003' from staff_volume;
insert into public.moderation_appeals(id,decision_id,user_id,statement,status,submitted_at)
 select appeal,decision,'91000000-0000-4000-8000-000000000001','Synthetic benchmark appeal statement',
 case when n<=2500 then 'pending' else 'upheld' end,stamp from staff_volume;
insert into public.moderation_account_actions(decision_id,user_id,action)
 select decision,'91000000-0000-4000-8000-000000000001','permanent_ban' from staff_volume where n%4=0;
insert into public.challenge_suggestions(id,user_id,kind,body,body_hash,status,created_at)
 select idea,'91000000-0000-4000-8000-000000000001','question','Synthetic volume idea',md5('volume-'||n),
 case when n<=2500 then 'pending' else 'rejected' end,stamp from staff_volume;
insert into business_private.accounts(id) select account from staff_volume;
insert into business_private.applications(id,applicant_id,state,created_at,submission)
 select application,account,case when n>2500 then 'declined' when n%2=0 then 'pending' else 'changes_requested' end,
 stamp,1 from staff_volume;
insert into business_private.submissions(application_id,submission,details,terms_version,privacy_version,accepted_at)
 select application,1,'{"brand_name":"Synthetic business"}','terms-v1','privacy-v1',stamp from staff_volume;
insert into business_private.privacy_cases(id,account_id,kind,verification_reference,state,received_at,due_at)
 select privacy,account,'access','synthetic-volume',
 case when n>2500 then 'completed' when n%2=0 then 'open' else 'executing' end,stamp,stamp+interval '30 days' from staff_volume;
insert into public.safety_removal_cases(id,token_hash,request_hash,request,queue,priority,state,received_at,closed_at,assigned_to)
 select intake,repeat('a',64),'synthetic-volume-'||n,'{}',case when n%4=0 then 'restricted_safety' else 'moderation' end,
 'normal',case when n>2500 then 'not_actionable' when n%2=0 then 'received' else 'needs_information' end,
 stamp,case when n>2500 then stamp+interval '1 hour' end,owner from staff_volume;
insert into staff_workflow_private.ownership(kind,case_id,assigned_to,revision)
 select kind,id,owner,1 from staff_volume cross join lateral
 (values('suggestion',idea),('business_application',application),('appeal',appeal),('business_privacy',privacy)) v(kind,id)
 where owner is not null;
analyze public.reports;
analyze public.admin_report_triage;
analyze public.moderation_decisions;
analyze public.moderation_account_actions;
analyze public.moderation_appeals;
analyze public.challenge_suggestions;
analyze business_private.applications;
analyze business_private.submissions;
analyze business_private.privacy_cases;
analyze public.safety_removal_cases;
analyze staff_workflow_private.ownership;
