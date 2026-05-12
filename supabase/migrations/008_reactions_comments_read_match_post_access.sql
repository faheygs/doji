-- Global feed allows any authenticated user to SELECT posts (005). Reactions and comments
-- still used the older predicate (own | public | friends), so RLS hid other users' reaction
-- rows while the post row was visible — per-emoji counts looked wrong for everyone except
-- the reactor. Align read access with "can you read this post?" by delegating to posts RLS
-- inside EXISTS (the inner SELECT on posts is subject to posts policies).

drop policy if exists "reactions_read" on public.reactions;
create policy "reactions_read" on public.reactions
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
    )
  );

drop policy if exists "comments_read" on public.comments;
create policy "comments_read" on public.comments
  for select using (
    exists (
      select 1 from public.posts p
      where p.id = post_id
    )
  );
