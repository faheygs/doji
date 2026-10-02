-- Run outside a transaction. Fail on existing/invalid indexes rather than silently skip.
-- Adds no access permissions. CONCURRENTLY preserves ordinary write availability.
-- Use psql's separate-statement execution. Do not submit this whole multi-statement
-- file as one Management API query (an implicit transaction can reject CONCURRENTLY).
set lock_timeout = '3s';
set statement_timeout = '10min';
create index concurrently comments_author_created_idx on public.comments(user_id, created_at desc);
create index concurrently reactions_author_created_idx on public.reactions(user_id, created_at desc);
reset lock_timeout;
reset statement_timeout;
