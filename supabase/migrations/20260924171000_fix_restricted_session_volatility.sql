-- The session read delegates to an audited portal session function and therefore
-- must not promise the planner that it is stable.
alter function public.get_admin_portal_session_v2() volatile;
