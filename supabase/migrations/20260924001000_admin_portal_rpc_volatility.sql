-- The admin RPCs inspect the authenticated request context through auth.jwt().
-- PostgreSQL treats that session lookup as volatile, so advertise the routines
-- accordingly instead of allowing the planner to reuse a result too broadly.
alter function public.get_admin_portal_session() volatile;

alter function public.get_admin_command_center_snapshot(integer) volatile;
