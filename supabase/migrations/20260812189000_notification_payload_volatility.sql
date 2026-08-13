-- JSON payload composition is deterministic for its arguments, but PostgreSQL's
-- analyzer classifies one JSON expression as stable. Match that contract so schema
-- lint remains clean without changing delivery behavior.

alter function public.increment_grouped_notification_payload(jsonb, text) stable;
