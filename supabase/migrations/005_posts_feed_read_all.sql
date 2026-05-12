-- Allow any signed-in user to read posts (global feed). Revisit when switching back to friends-only.
create policy "posts_read_all_authenticated" on public.posts
  for select using (auth.role() = 'authenticated');
