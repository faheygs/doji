-- Removes only this additive read/index; preserves ideas, decisions and member data.
begin;
set local lock_timeout='2s';
drop function public.get_doji_contributor_v1(uuid);
drop index public.admin_suggestion_contributor_v1_idx;
commit;
