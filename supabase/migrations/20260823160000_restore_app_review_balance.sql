-- Restore the documented App Review balance after recording the review flow.
-- Use a new ledger delivery key so this remains auditable and idempotent.

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
    raise notice 'Optional Apple reviewer profile is absent; skipping balance reset.';
    return;
  end if;

  credit_amount := greatest(4000 - coalesce(reviewer_balance, 0), 0);

  if credit_amount > 0 then
    perform public.award_sparks_once(
      reviewer_id,
      credit_amount,
      'app_review_credit',
      'apple-app-review-balance-v2'
    );
  end if;
end;
$$;
