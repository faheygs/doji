-- Restore only the captured reward bindings; retain all balances, awards and fences.
begin;
set local lock_timeout='2s';
do $$ declare original record; begin
  for original in select * from sparks_economy_v2_private.originals loop
    if md5(pg_get_functiondef(original.signature::regprocedure))<>original.installed_hash then
      raise exception 'Reward binding changed after install: %',original.signature; end if;
  end loop;
  update sparks_economy_v2_private.settings set enabled_from=null;
  for original in select * from sparks_economy_v2_private.originals loop execute original.definition; end loop;
end $$;
drop trigger economy_v2_first_bonus on first_doji_badges_private.winners;
drop trigger economy_v2_derived_level_reward on public.profiles;
commit;
