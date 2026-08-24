-- Restore the dedicated App Review accounts after recording the Guideline 1.2
-- report/block demonstration. This is optional seed state and safely skips
-- environments where either Auth-backed profile does not exist.

do $$
declare
  reviewer_id uuid;
  helper_id uuid;
begin
  select profile.id into reviewer_id
  from public.profiles profile
  where lower(profile.username) = 'reviewer'
  limit 1;

  select profile.id into helper_id
  from public.profiles profile
  where lower(profile.username) = 'reviewhelper'
  limit 1;

  if reviewer_id is null or helper_id is null then
    raise notice 'Optional App Review profiles are absent; skipping test-state reset.';
    return;
  end if;

  delete from public.blocks block
  where (block.blocker_id = reviewer_id and block.blocked_id = helper_id)
     or (block.blocker_id = helper_id and block.blocked_id = reviewer_id);

  delete from public.reports report
  where (report.reporter_id = reviewer_id and report.reported_user_id = helper_id)
     or (report.reporter_id = helper_id and report.reported_user_id = reviewer_id);

  delete from public.friendships friendship
  where (friendship.requester_id = reviewer_id and friendship.addressee_id = helper_id)
     or (friendship.requester_id = helper_id and friendship.addressee_id = reviewer_id);

  -- Inserting directly as accepted avoids producing a fake request/accept push.
  insert into public.friendships (
    requester_id,
    addressee_id,
    status,
    created_at,
    accepted_at
  ) values (
    least(reviewer_id, helper_id),
    greatest(reviewer_id, helper_id),
    'accepted',
    clock_timestamp(),
    clock_timestamp()
  );

  update public.profiles
  set is_banned = false
  where id in (reviewer_id, helper_id);
end;
$$;
