-- Stop inspection without changing occurrences, content or retained release evidence.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
update doji_readiness_private.settings set enabled=false where id;
revoke execute on function public.inspect_doji_readiness_v1(uuid) from service_role;
commit;
