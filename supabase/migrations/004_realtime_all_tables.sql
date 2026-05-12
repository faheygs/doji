-- Add remaining tables to supabase_realtime (003 adds posts + friendships).
-- If you never applied 003, you can run those ALTERs here too or keep 003 + this file.
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.challenges;
alter publication supabase_realtime add table public.daily_events;
alter publication supabase_realtime add table public.user_events;
alter publication supabase_realtime add table public.reactions;
alter publication supabase_realtime add table public.comments;
alter publication supabase_realtime add table public.streak_events;
