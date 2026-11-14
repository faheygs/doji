-- Deterministic reward scenarios with maximum social earnings, not measured member cohorts.
-- Excludes badges, campaigns, suggestions and spending; includes retained 200 welcome.
select jsonb_agg(to_jsonb(model) order by days,completion_seconds,xp_each) from (
  select days,completion_seconds,xp_each,public.level_from_xp(days*xp_each) as level,
    days*sparks_economy_v2_private.completion_amount(completion_seconds,false) as completion_sparks,
    days*5 as maximum_social_sparks,
    (select coalesce(sum(10*n),0) from generate_series(2,public.level_from_xp(days*xp_each)) n) as level_sparks,
    200+days*(sparks_economy_v2_private.completion_amount(completion_seconds,false)+5)+
      (select coalesce(sum(10*n),0) from generate_series(2,public.level_from_xp(days*xp_each)) n) as balance_before_spending
  from (values(7),(30),(90)) horizons(days)
    cross join (values(30::numeric),(540::numeric)) speed(completion_seconds)
    cross join (values(25),(100)) challenge(xp_each)
) model;
