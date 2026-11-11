-- Retaining rollback: stop new awards, keep earned badges/Sparks and event deduplication.
begin;
set local lock_timeout='2s';
update first_doji_badges_private.settings set enabled_from=null where singleton;
drop trigger if exists zz_first_doji_badge_completion on public.user_events;
commit;
