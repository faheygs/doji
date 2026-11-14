-- Retains all member content, completion and reward evidence.
begin;
set local lock_timeout='2s';
drop function if exists public.get_first_doji_v1(uuid,text);
drop function if exists first_doji_private.visible(public.user_events,uuid);
drop schema if exists first_doji_private;
commit;
drop index concurrently if exists public.user_events_first_doji_v1_idx;
