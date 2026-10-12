-- Appended to employeeEvidenceSetup in a network-disabled disposable database.
update public.reports set reported_user_id=current_setting('test.member_id')::uuid;
select set_config('test.employee_claims',current_setting('request.jwt.claims'),true);
create function pg_temp.assert_true(ok boolean, message text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion: %',message; end if; end $$;
create function pg_temp.snapshot() returns jsonb language sql as $$
select jsonb_build_object(
  'actions',(select jsonb_agg(to_jsonb(a) order by id) from public.moderation_account_actions a),
  'decisions',(select jsonb_agg(to_jsonb(a) order by id) from public.moderation_decisions a),
  'posts',(select jsonb_agg(to_jsonb(a) order by id) from public.posts a),
  'profiles',(select jsonb_agg(to_jsonb(a) order by id) from public.profiles a),
  'notices',(select count(*) from public.moderation_notices),
  'audits',(select count(*) from public.admin_audit_log),
  'events',(select jsonb_agg(to_jsonb(a) order by id) from public.domain_event_outbox a),
  'receipts',(select jsonb_agg(to_jsonb(a) order by user_id,idempotency_key) from public.admin_employee_command_receipts a));
$$;
create temp table results(name text primary key,result jsonb);
grant all on results to doji_employee;
set local role doji_employee;
insert into results values('decision',public.admin_decide_report_v3(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove_content','violence_threats','level_3',
  'Synthetic restricted review rationale','Synthetic member notice',
  current_setting('test.consequence'),1 * nullif(current_setting('test.days'),'')::integer,'replay-decision-key-0001'));
reset role;
insert into results values('before',pg_temp.snapshot());
set local role doji_employee;
select pg_temp.assert_true(public.admin_decide_report_v3(
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove_content','violence_threats','level_3',
  'Synthetic restricted review rationale','Synthetic member notice',
  current_setting('test.consequence'),1 * nullif(current_setting('test.days'),'')::integer,'replay-decision-key-0001')=
  (select result from results where name='decision'),'identical decision receipt');
reset role;
select pg_temp.assert_true(pg_temp.snapshot()=(select result from results where name='before'),'decision replay has zero side effects');
set local role doji_employee;
do $$begin
  perform public.admin_decide_report_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove_content','violence_threats','level_3',
    'A different rationale that must not apply','Synthetic member notice',current_setting('test.consequence'),
    nullif(current_setting('test.days'),'')::integer,'replay-decision-key-0001');
  raise exception 'Changed request unexpectedly accepted';
exception when others then if sqlerrm <> 'Idempotency key already used for a different command' then raise; end if; end$$;
reset role;
-- Exercise real member appeal submission, then employee reversal.
select set_config('test.decision_id',result->>'decision_id',true) from results where name='decision';
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('test.member_id'),'role','authenticated','aal','aal1')::text,true);
set local role authenticated;
select public.submit_moderation_appeal(current_setting('test.decision_id')::uuid,'Synthetic appeal for offline retry regression','replay-member-appeal-0001');
reset role;
select set_config('test.appeal_id',id::text,true) from public.moderation_appeals where decision_id=current_setting('test.decision_id')::uuid;
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
insert into results values('appeal',public.admin_review_moderation_appeal(current_setting('test.appeal_id')::uuid,'reverse','Synthetic super admin appeal reversal','replay-appeal-key-0001'));
reset role;
-- A subsequent decision removes collateral content restored by the first appeal.
select set_config('request.jwt.claims','{}',true);
insert into public.reports(id,post_id,reason,target_kind,reporter_id,reported_user_id) values
('cccccccc-cccc-4ccc-8ccc-cccccccccccc','cccccccc-cccc-4ccc-8ccc-cccccccccccc','spam','post',current_setting('test.member_id')::uuid,current_setting('test.member_id')::uuid);
select set_config('request.jwt.claims',current_setting('test.employee_claims'),true);
set local role doji_employee;
select public.admin_decide_report_v3('cccccccc-cccc-4ccc-8ccc-cccccccccccc','remove_content','spam_scam','level_1',
  'Subsequent independent removal rationale','Subsequent member notice',null,null,'replay-later-removal-0001');
reset role;
update results set result=pg_temp.snapshot() where name='before';
set local role doji_employee;
select pg_temp.assert_true(public.admin_review_moderation_appeal(current_setting('test.appeal_id')::uuid,'reverse',
 'Synthetic super admin appeal reversal','replay-appeal-key-0001')=(select result from results where name='appeal'),'identical appeal receipt');
select pg_temp.assert_true(public.admin_decide_report_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove_content','violence_threats','level_3',
 'Synthetic restricted review rationale','Synthetic member notice',current_setting('test.consequence'),nullif(current_setting('test.days'),'')::integer,
 'replay-decision-key-0001')=(select result from results where name='decision'),'original decision retry after reversal');
reset role;
select pg_temp.assert_true(pg_temp.snapshot()=(select result from results where name='before'),'no reactivation or repeated restoration after appeal');
select pg_temp.assert_true(not exists(select 1 from public.command_receipts where user_id=auth.uid()),'employee receipts isolated');
select pg_temp.assert_true(exists(select 1 from public.command_receipts where user_id=current_setting('test.member_id')::uuid),'member receipt preserved');
-- Historical receipt must return without mutation, even after reversal.
update public.admin_employee_command_receipts set result=result-'_moderation_request_sha256'
 where user_id=auth.uid() and idempotency_key='replay-decision-key-0001';
update results set result=pg_temp.snapshot() where name='before';
set local role doji_employee;
select public.admin_decide_report_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove_content','violence_threats','level_3',
 'Synthetic restricted review rationale','Synthetic member notice',current_setting('test.consequence'),nullif(current_setting('test.days'),'')::integer,'replay-decision-key-0001');
reset role;
select pg_temp.assert_true(pg_temp.snapshot()=(select result from results where name='before'),'historical receipt does not replay effects');
update public.admin_employees set roles=array['moderator'] where id=auth.uid();
set local role doji_employee;
do $$begin
 perform public.admin_decide_report_v3('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','remove_content','violence_threats','level_3',
 'Synthetic restricted review rationale','Synthetic member notice',current_setting('test.consequence'),nullif(current_setting('test.days'),'')::integer,'replay-decision-key-0001');
 raise exception 'Restricted replay allowed without legal access';
exception when others then if sqlerrm <> 'Restricted safety authorization required' then raise; end if; end$$;
reset role;
update public.admin_employees set status='disabled' where id=auth.uid();
set local role doji_employee;
do $$begin
 perform public.admin_review_moderation_appeal(current_setting('test.appeal_id')::uuid,'reverse','Synthetic super admin appeal reversal','replay-appeal-key-0001');
 raise exception 'Disabled employee replay accepted';
exception when others then if sqlerrm <> 'Moderation write access required' then raise; end if; end$$;
reset role;
rollback;
