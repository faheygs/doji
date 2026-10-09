-- Disable any future gateway route before applying this rollback.
-- Preserve announcements, audit history and receipts; never undo published data.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
do $$begin
  if not exists(select 1 from pg_proc
    where oid=to_regprocedure('public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid)')
      and md5(replace(prosrc,E'\r\n',E'\n'))='d01abb9dc72e73ef33ae5481ddb2085b') then
    raise exception 'Announcement candidate changed or missing; inspect before rollback';
  end if;
end$$;
drop function public.admin_announcement_compose_v1(text,uuid,text,jsonb,uuid);
commit;
