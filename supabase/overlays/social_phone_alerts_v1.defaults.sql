-- Additive default policy for existing and new members; no profile rewrite or activation.
begin;
set local lock_timeout = '2s';
do $install$
declare
  target_signature text;
  original text; changed text; saved record; needle text; replacement text;
begin
  if (select enabled from social_notification_private.configuration where singleton) then
    raise exception 'Disable social phone delivery before changing defaults';
  end if;
  foreach target_signature in array array['social_notification_private.preference(uuid,text)',
    'public.get_social_phone_alert_capabilities_v1()'] loop
  original := pg_get_functiondef(target_signature::regprocedure);
  select * into saved from social_notification_private.originals where signature=target_signature;
  if found then
    if original is distinct from saved.installed_definition then
      raise exception 'Intervening social notification default change';
    end if;
    continue;
  end if;
  if target_signature='social_notification_private.preference(uuid,text)' then
    needle := 'and p.notification_preferences->category = ''true''::jsonb';
    replacement := 'and (p.notification_preferences->category is null or p.notification_preferences->category = ''true''::jsonb)';
  else
    needle := 'jsonb_build_object(''enabled'',(select enabled from social_notification_private.configuration where singleton))';
    replacement := 'jsonb_build_object(''settingsAvailable'',true,''enabled'',(select enabled from social_notification_private.configuration where singleton))';
  end if;
  if length(original)-length(replace(original,needle,''))<>length(needle) then
    raise exception 'Unexpected social notification preference contract';
  end if;
  changed := replace(original,needle,replacement);
  insert into social_notification_private.originals(signature,definition) values(target_signature,original);
  execute changed;
  update social_notification_private.originals set installed_definition=pg_get_functiondef(target_signature::regprocedure)
    where signature=target_signature;
  end loop;
end;
$install$;
commit;
