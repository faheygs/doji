-- Separate, non-transactional installation; concurrent build permits normal writes.
set lock_timeout = '2s';
set statement_timeout = '5min';
create index concurrently if not exists comments_thread_page_v2_idx
  on public.comments(post_id, parent_id, created_at desc, id desc)
  where moderation_status = 'visible';
reset lock_timeout;
reset statement_timeout;
