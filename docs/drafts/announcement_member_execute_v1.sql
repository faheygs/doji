-- Owner-approved LOCAL candidate only. Production deployment remains gated.
-- No function body, authenticated grant, table, receipt, or announcement changes.
begin;
set local lock_timeout = '2s';
set local statement_timeout = '8s';

revoke execute on function public.claim_active_app_announcement() from anon;
revoke execute on function public.record_app_announcement_action(uuid, text) from anon;

do $$
begin
  if has_function_privilege('anon', 'public.claim_active_app_announcement()', 'execute')
    or has_function_privilege('anon', 'public.record_app_announcement_action(uuid,text)', 'execute')
    or not has_function_privilege('authenticated', 'public.claim_active_app_announcement()', 'execute')
    or not has_function_privilege('authenticated', 'public.record_app_announcement_action(uuid,text)', 'execute') then
    raise exception 'Announcement execute boundary differs from the reviewed contract';
  end if;
end;
$$;
commit;
