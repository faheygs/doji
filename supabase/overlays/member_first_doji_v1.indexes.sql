-- Run independently, outside a transaction, after release/capacity approval.
set lock_timeout = '2s';
set statement_timeout = '2min';
create index concurrently if not exists user_events_first_doji_v1_idx
  on public.user_events (daily_event_id, completed_at, id)
  where status in ('completed', 'late') and completed_at is not null;
reset lock_timeout;
reset statement_timeout;
