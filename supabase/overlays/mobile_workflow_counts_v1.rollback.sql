-- Retain bounded observations and replay fences. No member data or contracts changed.
begin;
update mobile_workflow_private.settings set enabled=false where id;
revoke execute on function public.record_mobile_workflow_counts_v1(uuid,jsonb),public.get_mobile_workflow_counts_v1() from service_role;
commit;
