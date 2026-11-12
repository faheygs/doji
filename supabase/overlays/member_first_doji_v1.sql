-- Additive authorized read only. Completion, rewards, outbox and existing reads are unchanged.
begin;
set local lock_timeout = '2s';
do $$ begin
  if not exists(select 1 from pg_index where indexrelid =
    to_regclass('public.user_events_first_doji_v1_idx') and indisvalid and indisready
      and indrelid='public.user_events'::regclass
      and pg_get_indexdef(indexrelid,1,true)='daily_event_id'
      and pg_get_indexdef(indexrelid,2,true)='completed_at'
      and pg_get_indexdef(indexrelid,3,true)='id'
      and indnatts=3
      and pg_get_expr(indpred,indrelid) = '((status = ANY (ARRAY[''completed''::text, ''late''::text])) AND (completed_at IS NOT NULL))') then
    raise exception 'Install and verify the concurrent first-Doji index first';
  end if;
end $$;
create schema if not exists first_doji_private;
revoke all on schema first_doji_private from public, anon, authenticated;

create or replace function first_doji_private.visible(ue public.user_events, viewer uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.profiles p where p.id=ue.user_id and p.is_banned is not true and p.is_demo_account is not true)
    and not exists(select 1 from public.blocks b where
      (b.blocker_id=viewer and b.blocked_id=ue.user_id) or
      (b.blocked_id=viewer and b.blocker_id=ue.user_id))
    and not exists(select 1 from public.friendships f where f.status='blocked' and
      ((f.requester_id=viewer and f.addressee_id=ue.user_id) or
       (f.addressee_id=viewer and f.requester_id=ue.user_id)))
    and exists(select 1 from public.daily_events e join public.challenges c on c.id=e.challenge_id
      where e.id=ue.daily_event_id and case when c.type='poll' then
        exists(select 1 from public.poll_votes v where v.user_event_id=ue.id and v.user_id=ue.user_id
          and v.daily_event_id=ue.daily_event_id and v.moderation_status='visible'
          and not exists(select 1 from public.reports r where r.reporter_id=viewer
            and r.poll_vote_id=v.id and r.status='pending'))
        and exists(select 1 from public.posts p where p.daily_event_id=ue.daily_event_id
          and p.is_community_poll is true and public.can_view_full_post(p.id,viewer))
      else exists(select 1 from public.posts p where p.user_event_id=ue.id
        and p.user_id=ue.user_id and p.daily_event_id=ue.daily_event_id
        and p.is_community_poll is not true and p.is_demo is not true
        and public.can_view_full_post(p.id,viewer)) end);
$$;
revoke all on function first_doji_private.visible(public.user_events,uuid) from public,anon,authenticated;

create or replace function public.get_first_doji_v1(p_daily_event_id uuid, p_audience text default 'friends')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare viewer uuid:=auth.uid(); winner public.user_events; result jsonb;
begin
  if viewer is null then raise exception 'Not authenticated' using errcode='42501'; end if;
  if p_audience is null or p_audience not in ('friends','everyone') or p_daily_event_id is null then
    raise exception 'Invalid first Doji request' using errcode='22023';
  end if;
  if not public.can_access_daily_event(p_daily_event_id,viewer) or not exists(
    select 1 from public.user_events u join public.profiles p on p.id=u.user_id
    where u.daily_event_id=p_daily_event_id and u.user_id=viewer
      and u.status in ('completed','late') and p.is_banned is not true) then
    raise exception 'Feed is not available' using errcode='42501';
  end if;
  if p_audience='friends' then
    -- Start from the capped accepted graph, not a scan through every non-friend.
    with friends as materialized (
      select viewer id union select case when f.requester_id=viewer then f.addressee_id else f.requester_id end
      from public.friendships f where f.status='accepted' and (f.requester_id=viewer or f.addressee_id=viewer)
    ) select u.* into winner from friends f join public.user_events u on u.user_id=f.id
      where u.daily_event_id=p_daily_event_id and u.status in ('completed','late')
        and u.completed_at is not null and first_doji_private.visible(u,viewer)
      order by u.completed_at,u.id limit 1;
  else
    select u.* into winner from public.user_events u
      where u.daily_event_id=p_daily_event_id and u.status in ('completed','late')
        and u.completed_at is not null and first_doji_private.visible(u,viewer)
      order by u.completed_at,u.id limit 1;
  end if;
  if winner.id is null then return null; end if;
  select jsonb_build_object('daily_event_id',p_daily_event_id,'audience',p_audience,
    'completed_at',winner.completed_at,'profile',jsonb_build_object('id',p.id,'username',p.username,
      'display_name',p.display_name,'avatar_url',p.avatar_url,'equipped_border_key',p.equipped_border_key))
    into result from public.profiles p where p.id=winner.user_id;
  return result;
end;
$$;
-- Hosted public-schema defaults must not widen this member-only read boundary.
revoke all on function public.get_first_doji_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_first_doji_v1(uuid,text) to authenticated;
commit;
