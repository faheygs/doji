-- Append to sparks_economy_v2.sql; never install this fragment separately.
do $bind$
declare target_signature text; original text; updated text; injection text; needle text;
begin
  if not exists(select 1 from sparks_economy_v2_private.settings where enabled_from is null)
    or exists(select 1 from sparks_economy_v2_private.originals) then
    raise exception 'Fresh disabled economy preparation required'; end if;
  foreach target_signature in array array[
    'public.trg_user_event_complete()', 'public.trg_sparks_post()', 'public.trg_sparks_poll_vote()',
    'public.trg_sparks_comment()', 'public.trg_sparks_reaction()',
    'public.trg_sparks_friend_request()', 'public.trg_sparks_friend_accept()',
    'public.trg_profile_level_up_sparks()'
  ] loop
    select pg_get_functiondef(target_signature::regprocedure) into original;
    insert into sparks_economy_v2_private.originals values(target_signature,original,null);
    original:=replace(original,E'\r\n',E'\n');
    if target_signature='public.trg_user_event_complete()' then
      needle:='PERFORM public.award_sparks(NEW.user_id, v_sparks, ''challenge_complete'', NEW.id::text);';
      if (length(original)-length(replace(original,needle,'')))/length(needle)<>1 then
        raise exception 'Completion award contract changed'; end if;
      updated:=replace(original,needle,'IF NOT sparks_economy_v2_private.complete(NEW) THEN '||needle||' END IF;');
    else
      injection:=case target_signature
        when 'public.trg_sparks_post()' then
          'IF sparks_economy_v2_private.applies(NEW.daily_event_id) THEN RETURN NEW; END IF;'
        when 'public.trg_sparks_poll_vote()' then
          'IF sparks_economy_v2_private.applies(NEW.daily_event_id) THEN RETURN NEW; END IF;'
        when 'public.trg_sparks_comment()' then
          'IF sparks_economy_v2_private.social(NEW.user_id,NEW.post_id,''comment'') THEN RETURN NEW; END IF;'
        when 'public.trg_sparks_reaction()' then
          'IF sparks_economy_v2_private.social(NEW.user_id,NEW.post_id,''reaction'') THEN RETURN NEW; END IF;'
        when 'public.trg_profile_level_up_sparks()' then
          'IF sparks_economy_v2_private.level_reward(NEW.id,OLD.level,NEW.level) THEN RETURN NEW; END IF;'
        else 'IF sparks_economy_v2_private.enabled() THEN RETURN NEW; END IF;' end;
      if position(E'BEGIN\n' in original)=0 then raise exception 'Trigger entry contract changed: %',target_signature; end if;
      updated:=regexp_replace(original,E'BEGIN\n',E'BEGIN\n  '||injection||E'\n');
    end if;
    execute updated;
    update sparks_economy_v2_private.originals set installed_hash=md5(pg_get_functiondef(target_signature::regprocedure))
      where originals.signature=target_signature;
  end loop;
end $bind$;
commit;
