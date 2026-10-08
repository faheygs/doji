-- Retain assignments/history/receipts. Stop the new surface and event producer.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update staff_workflow_private.settings set extended_enabled=false,events_enabled=false;
revoke all on function public.get_admin_staff_work_page_v1(text,text,text,integer,timestamptz,text),
 public.get_admin_staff_event_channels_v1() from doji_employee;
drop trigger staff_workflow_ownership_event on staff_workflow_private.ownership;
drop trigger staff_workflow_report_event on public.reports;
drop trigger staff_workflow_triage_event on public.admin_report_triage;
drop trigger staff_workflow_appeal_event on public.moderation_appeals;
drop trigger staff_workflow_appeal_decision_event on public.moderation_decisions;
drop trigger staff_workflow_appeal_action_event on public.moderation_account_actions;
drop trigger staff_workflow_idea_event on public.challenge_suggestions;
drop trigger staff_workflow_business_event on business_private.applications;
drop trigger staff_workflow_privacy_event on business_private.privacy_cases;
drop trigger staff_workflow_intake_event on public.safety_removal_cases;
-- Already committed identifier events may still be delivered. They grant no read
-- or command authority; consumers must honor the gate and fresh authorization.
commit;
