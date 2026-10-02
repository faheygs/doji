-- Approved separately executed concurrent index; do not wrap in a transaction.
create index concurrently reactions_author_created_idx on public.reactions(user_id, created_at desc);
