-- Revert global post visibility: feed is friends-only (+ own posts + explicit public posts).
drop policy if exists "posts_read_all_authenticated" on public.posts;
