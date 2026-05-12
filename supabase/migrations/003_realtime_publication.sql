-- Broadcast row changes to authenticated clients (RLS still applies per subscriber).
-- For full app coverage, also apply 004_realtime_all_tables.sql (profiles, events, reactions, …).
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.friendships;
