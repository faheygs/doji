-- Approved separately executed concurrent index; do not wrap in a transaction.
create index concurrently comments_author_created_idx on public.comments(user_id, created_at desc);
