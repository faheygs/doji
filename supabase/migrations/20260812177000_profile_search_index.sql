-- Contains-search is used by Find people. A regular btree cannot accelerate
-- ILIKE '%term%' once the profile table grows.
create extension if not exists pg_trgm with schema extensions;
create index if not exists profiles_username_trgm_idx
  on public.profiles using gin (username extensions.gin_trgm_ops);
