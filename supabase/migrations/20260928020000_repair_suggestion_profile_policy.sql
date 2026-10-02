-- Restore the existing owner/admin predicate without exposing private profiles.
-- No grants, function bodies, commands, rewards, events or employee policies change.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter policy challenge_suggestions_select_own on public.challenge_suggestions
  using (user_id = (select auth.uid()) or (select public.is_current_user_admin()));
alter policy challenge_suggestions_update_admin on public.challenge_suggestions
  using ((select public.is_current_user_admin()));
commit;
