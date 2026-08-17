-- close_daily_event historically marked every pending participant missed at the
-- shared close, including users whose signup-day grace was still valid. Restore
-- only uncompleted grace occurrences whose server-authorized deadline is future.
update public.user_events participant
set status = 'pending'
where participant.signup_day_grace is true
  and participant.status = 'missed'
  and participant.expires_at > clock_timestamp()
  and participant.completed_at is null
  and not exists (
    select 1 from public.posts post
    where post.user_event_id = participant.id
  )
  and not exists (
    select 1 from public.poll_votes vote
    where vote.user_event_id = participant.id
  );
