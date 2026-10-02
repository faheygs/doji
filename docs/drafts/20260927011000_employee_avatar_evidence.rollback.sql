-- Run in one transaction AFTER removing the dependent local case-read draft.
-- Restore only the preexisting employee boundary; no member policy changes.
alter policy employee_report_evidence_boundary on storage.objects
  using (bucket_id='post-media' and public.employee_can_read_report_evidence_v1(name));
drop policy employee_avatar_evidence_read on storage.objects;
drop function public.employee_can_read_avatar_evidence_v1(text);
drop index public.employee_avatar_decision_reference_idx;
