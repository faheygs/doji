-- Cover the joins used by get_feed_page_snapshot. Foreign keys do not create
-- indexes automatically in Postgres; without these, a larger feed would scan
-- posts for every occurrence and blocks in the reverse direction.

create index if not exists posts_user_event_created_idx
  on public.posts (user_event_id, created_at desc)
  where is_community_poll is not true;

create index if not exists blocks_blocked_blocker_idx
  on public.blocks (blocked_id, blocker_id);

create index if not exists poll_options_challenge_position_idx
  on public.poll_options (challenge_id, position);
