-- Allow deliberate operator-approved Spark credits to remain auditable without
-- impersonating a gameplay reward or directly editing profiles.sparks.

alter table public.spark_ledger
  drop constraint if exists spark_ledger_reason_check;

alter table public.spark_ledger
  add constraint spark_ledger_reason_check
  check (reason in (
    'challenge_complete', 'level_up', 'badge_unlock', 'buy_in', 'purchase',
    'welcome_bonus', 'comment', 'reaction', 'post', 'poll_vote',
    'friend_request', 'friend_accept', 'suggestion_approved',
    'app_review_credit', 'admin_grant'
  ));
