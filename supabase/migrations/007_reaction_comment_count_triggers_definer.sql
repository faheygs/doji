-- Reacting / commenting runs as the signed-in user. Count triggers UPDATE the *post author's* row.
-- Without SECURITY DEFINER, posts RLS blocks that update and the insert rolls back (403 / failed writes).

create or replace function public.update_reaction_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set reaction_count = reaction_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set reaction_count = greatest(reaction_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

create or replace function public.update_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
  elsif TG_OP = 'DELETE' then
    update public.posts set comment_count = greatest(comment_count - 1, 0) where id = old.post_id;
  end if;
  return null;
end;
$$;

-- Always allow reading your own reaction rows (e.g. toggle / feed batch) even when post visibility
-- rules would hide other people's reactions on that post.
create policy "reactions_read_own" on public.reactions
  for select using (auth.uid() = user_id);
