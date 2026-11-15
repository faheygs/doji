-- Disable delivery and restore delivery dependencies; retain receipts and preference compatibility.
begin;
set local lock_timeout = '2s';
update social_notification_private.configuration set enabled=false where singleton;
do $$ declare saved record; current_definition text;
begin
  for saved in select * from social_notification_private.originals loop
    -- New clients may already have stored these booleans. Keep accepting harmless
    -- preference writes after delivery rollback rather than breaking Settings.
    if saved.signature='public.update_own_profile(jsonb,text)' then continue; end if;
    current_definition:=pg_get_functiondef(saved.signature::regprocedure);
    if current_definition=saved.definition then continue; end if;
    if current_definition is distinct from saved.installed_definition then
      raise exception 'Intervening dependency change: %',saved.signature;
    end if;
    execute saved.definition;
  end loop;
end $$;
drop trigger if exists social_phone_comment_v1 on public.comments;
drop trigger if exists social_phone_mention_v1 on public.comment_mentions;
commit;
