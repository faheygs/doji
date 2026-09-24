-- The v2 session wrapper inherits the volatile request-context/server-clock
-- behavior of get_admin_portal_session(). Advertise it accurately so the
-- planner never reuses an authenticated result across calls.
alter function public.get_admin_portal_session_v2() volatile;
