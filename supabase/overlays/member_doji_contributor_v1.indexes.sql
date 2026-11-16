-- Run outside a transaction only after hosted capacity/lock review.
create index concurrently if not exists admin_suggestion_contributor_v1_idx
  on public.admin_suggestion_reviews(challenge_id,suggestion_id) where challenge_id is not null;
