-- The security-definer allowlist hardening intentionally revoked every legacy
-- function grant, but three helpers are invoked by authenticated RLS policies
-- and one owner-scoped helper is invoked by realtime-token with the caller JWT.
-- PostgreSQL checks EXECUTE before evaluating those helpers, so the grants must
-- remain explicit even though none of them exposes an unrestricted data read.

revoke all on function public.can_access_daily_event(uuid, uuid)
  from public, anon;
revoke all on function public.can_view_full_post(uuid, uuid, uuid, uuid, boolean)
  from public, anon;
revoke all on function public.is_current_user_admin()
  from public, anon;

grant execute on function public.can_access_daily_event(uuid, uuid)
  to authenticated;
grant execute on function public.can_view_full_post(uuid, uuid, uuid, uuid, boolean)
  to authenticated;
grant execute on function public.is_current_user_admin()
  to authenticated;

-- posts_select is the single authoritative SELECT policy. These original
-- permissive policies overlap it, bypass its occurrence contract for some rows,
-- and keep the obsolete are_friends helper on the read path.
drop policy if exists posts_read_own on public.posts;
drop policy if exists posts_read_friends on public.posts;

