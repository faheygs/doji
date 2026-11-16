-- Additive read only: no change to editorial decisions, timing, participation or rewards.
begin;
set local lock_timeout='2s';
do $$ begin
  if not exists(select 1 from pg_index where indexrelid=to_regclass('public.admin_suggestion_contributor_v1_idx')
    and indisvalid and indisready and indrelid='public.admin_suggestion_reviews'::regclass
    and indnatts=2 and pg_get_indexdef(indexrelid,1,true)='challenge_id'
    and pg_get_indexdef(indexrelid,2,true)='suggestion_id'
    and pg_get_expr(indpred,indrelid)='(challenge_id IS NOT NULL)') then
    raise exception 'Install and verify contributor lookup index first';
  end if;
end $$;

create or replace function public.get_doji_contributor_v1(p_daily_event_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); challenge uuid; sources uuid[]; author uuid; result jsonb;
begin
  if viewer is null or not exists(select 1 from public.profiles p where p.id=viewer and p.is_banned is not true) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  select e.challenge_id into challenge from public.daily_events e
    where e.id=p_daily_event_id and e.activated_at is not null
      and e.activated_at<=now() and e.fires_at<=now()
      and public.can_access_daily_event(e.id,viewer);
  if challenge is null then raise exception 'Doji unavailable' using errcode='42501'; end if;
  -- Never infer historical authorship from matching question text. Ambiguity hides credit.
  select array_agg(r.suggestion_id) into sources from (
    select r.suggestion_id from public.admin_suggestion_reviews r
    where r.challenge_id=challenge order by r.suggestion_id limit 2
  ) r;
  if cardinality(sources) is distinct from 1 then return null; end if;
  select s.user_id into author from public.challenge_suggestions s
    join public.admin_suggestion_reviews r on r.suggestion_id=s.id
    where s.id=sources[1] and r.decision='approved' and s.status='approved';
  if author is null or exists(select 1 from public.blocks b where
      (b.blocker_id=viewer and b.blocked_id=author) or (b.blocker_id=author and b.blocked_id=viewer))
    or exists(select 1 from public.friendships f where f.status='blocked' and
      ((f.requester_id=viewer and f.addressee_id=author) or (f.requester_id=author and f.addressee_id=viewer)))
    then return null; end if;
  select jsonb_build_object('daily_event_id',p_daily_event_id,'profile',jsonb_build_object(
    'id',p.id,'username',p.username,'display_name',p.display_name,
    'avatar_url',p.avatar_url,'equipped_border_key',p.equipped_border_key)) into result
    from public.profiles p where p.id=author and p.is_banned is not true and p.is_demo_account is not true;
  return result;
end;
$$;
revoke all on function public.get_doji_contributor_v1(uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_doji_contributor_v1(uuid) to authenticated;
commit;
