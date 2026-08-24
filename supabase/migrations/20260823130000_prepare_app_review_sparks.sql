-- Give the dedicated Apple reviewer account a durable balance for exercising the
-- normal missed-Doji buy-in flow. This is an auditable, idempotent ledger credit;
-- it never changes balances for regular accounts and never bypasses participation.

alter table public.spark_ledger
  drop constraint if exists spark_ledger_reason_check;

alter table public.spark_ledger
  add constraint spark_ledger_reason_check
  check (reason in (
    'challenge_complete', 'level_up', 'badge_unlock', 'buy_in', 'purchase',
    'welcome_bonus', 'comment', 'reaction', 'post', 'poll_vote',
    'friend_request', 'friend_accept', 'suggestion_approved',
    'app_review_credit'
  ));

do $$
declare
  reviewer_id uuid;
  reviewer_balance integer;
  credit_amount integer;
begin
  select profile.id, profile.sparks
    into reviewer_id, reviewer_balance
  from public.profiles profile
  where lower(profile.username) = 'reviewer'
  limit 1;

  if reviewer_id is null then
    raise notice 'Optional Apple reviewer profile @reviewer was not found; skipping review credit.';
    return;
  end if;

  credit_amount := greatest(4000 - coalesce(reviewer_balance, 0), 0);

  if credit_amount > 0 then
    perform public.award_sparks_once(
      reviewer_id,
      credit_amount,
      'app_review_credit',
      'apple-app-review-balance-v1'
    );
  end if;
end;
$$;
