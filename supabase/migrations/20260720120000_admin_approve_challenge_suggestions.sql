-- Allow admins to insert into challenges/poll_options so approving a
-- challenge_suggestions row can promote it into the schedulable pool.
-- (challenges_insert_auth / poll_options_insert_auth were intentionally
-- dropped for all authenticated users in 20260512120000_harden_rls_prod.sql —
-- this restores insert access for admins only.)

create policy "challenges_admin_insert" on public.challenges
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );

create policy "poll_options_admin_insert" on public.poll_options
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and is_admin = true)
  );
