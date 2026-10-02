-- Viewer-relative report filters run on every feed/thread snapshot. Keep those
-- checks bounded to the reporter's small set of open reports.

create index if not exists reports_pending_reporter_post_idx
  on public.reports (reporter_id, post_id)
  where status = 'pending' and post_id is not null;

create index if not exists reports_pending_reporter_comment_idx
  on public.reports (reporter_id, comment_id)
  where status = 'pending' and comment_id is not null;

create index if not exists reports_pending_reporter_poll_vote_idx
  on public.reports (reporter_id, poll_vote_id)
  where status = 'pending' and poll_vote_id is not null;
