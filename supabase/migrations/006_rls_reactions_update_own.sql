-- Client uses upsert on reactions (same post_id + user_id + emoji). ON CONFLICT triggers UPDATE,
-- which requires its own policy — without it PostgREST returns 403 Forbidden.
create policy "reactions_update_own" on public.reactions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
