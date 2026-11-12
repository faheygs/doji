-- Install disabled. Enable only for newly starting occurrences after qualification.
begin;
set local lock_timeout='2s';
do $$ begin
  if to_regprocedure('first_doji_private.visible(public.user_events,uuid)') is null
    or to_regprocedure('public.get_first_doji_v1(uuid,text)') is null
    then raise exception 'Install and qualify the first-Doji authorized read before badges'; end if;
end $$;
create schema if not exists first_doji_badges_private;
revoke all on schema first_doji_badges_private from public,anon,authenticated;
create table if not exists first_doji_badges_private.settings (
  singleton boolean primary key default true check(singleton),
  enabled_from timestamptz
);
insert into first_doji_badges_private.settings(singleton) values(true) on conflict do nothing;
-- Event identity survives content retention and account deletion; a win is never reassigned.
create table if not exists first_doji_badges_private.winners (
  daily_event_id uuid primary key,
  user_event_id uuid not null unique,
  user_id uuid references auth.users(id) on delete set null,
  recorded_at timestamptz not null default clock_timestamp()
);
create table if not exists first_doji_badges_private.counts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  wins bigint not null check(wins>0)
);
revoke all on all tables in schema first_doji_badges_private from public,anon,authenticated;
alter table first_doji_badges_private.settings enable row level security;
alter table first_doji_badges_private.winners enable row level security;
alter table first_doji_badges_private.counts enable row level security;

insert into public.badge_categories(id,name,emoji,description,sort_order)
values('first_doji','First to Doji','🏆','Be the first overall to complete a Doji.',10)
on conflict(id) do nothing;
insert into public.badge_tiers(id,category_id,tier,criteria_type,criteria_value,sort_order) values
 ('first_doji_bronze','first_doji','bronze','first_doji_wins',1,1),
 ('first_doji_silver','first_doji','silver','first_doji_wins',10,2),
 ('first_doji_gold','first_doji','gold','first_doji_wins',25,3),
 ('first_doji_diamond','first_doji','diamond','first_doji_wins',100,4)
on conflict(id) do nothing;

do $$ begin
  if (select count(*) from public.badge_tiers where category_id='first_doji')<>4
    or exists(select 1 from (values
      ('first_doji_bronze','bronze',1,1),('first_doji_silver','silver',10,2),
      ('first_doji_gold','gold',25,3),('first_doji_diamond','diamond',100,4)
    ) expected(id,tier,threshold,position) left join public.badge_tiers b on b.id=expected.id
      where b.category_id is distinct from 'first_doji' or b.tier is distinct from expected.tier
        or b.criteria_type is distinct from 'first_doji_wins'
        or b.criteria_value is distinct from expected.threshold or b.sort_order is distinct from expected.position)
    then raise exception 'Unexpected first-Doji badge catalogue; refusing to change existing rewards'; end if;
end $$;

create or replace function first_doji_badges_private.record_completion()
returns trigger language plpgsql security definer set search_path='' as $$
declare enabled_at timestamptz; kind text; event_at timestamptz; claimed uuid;
  total bigint; earned text;
begin
  select enabled_from into enabled_at from first_doji_badges_private.settings where singleton;
  if enabled_at is null then return new; end if;
  -- Most submissions stop at this unique-index probe, without locking a shared row.
  if exists(select 1 from first_doji_badges_private.winners where daily_event_id=new.daily_event_id)
    then return new; end if;
  select c.type,e.fires_at into kind,event_at from public.daily_events e
    join public.challenges c on c.id=e.challenge_id where e.id=new.daily_event_id;
  if event_at is null or event_at<enabled_at or event_at>clock_timestamp()
    or new.completed_at is null or new.completed_at<event_at then return new; end if;
  if not exists(select 1 from public.profiles p where p.id=new.user_id
    and p.is_banned is not true and p.is_demo_account is not true) then return new; end if;
  if kind='poll' then
    if not exists(select 1 from public.poll_votes v where v.user_event_id=new.id
      and v.user_id=new.user_id and v.daily_event_id=new.daily_event_id
      and v.moderation_status='visible') then return new; end if;
  elsif kind in ('photo','task','format') then
    if not exists(select 1 from public.posts p where p.user_event_id=new.id
      and p.user_id=new.user_id and p.daily_event_id=new.daily_event_id
      and p.is_demo is not true and p.is_community_poll is not true
      and p.moderation_status='visible') then return new; end if;
  else return new;
  end if;
  -- Competing first completions arbitrate once. A rolled-back claimant earns nothing.
  insert into first_doji_badges_private.winners(daily_event_id,user_event_id,user_id)
  values(new.daily_event_id,new.id,new.user_id) on conflict(daily_event_id) do nothing
  returning user_id into claimed;
  if claimed is null then return new; end if;
  insert into first_doji_badges_private.counts(user_id,wins) values(claimed,1)
  on conflict(user_id) do update set wins=first_doji_badges_private.counts.wins+1
  returning wins into total;
  select tier into earned from public.badge_tiers where category_id='first_doji'
    and criteria_type='first_doji_wins' and criteria_value<=total order by sort_order desc limit 1;
  if earned is not null then perform public.upsert_badge_tier(claimed,'first_doji',earned); end if;
  -- Existing badge tier hints cover milestones; this hint also refreshes intermediate progress.
  perform public.enqueue_domain_event('user:'||claimed::text||':events','badge.updated',claimed,
    jsonb_build_object('userId',claimed,'categoryId','first_doji'),
    'first-doji-win:'||new.daily_event_id::text);
  return new;
end;
$$;
revoke all on function first_doji_badges_private.record_completion() from public,anon,authenticated;
drop trigger if exists zz_first_doji_badge_completion on public.user_events;
create trigger zz_first_doji_badge_completion after update of status on public.user_events
for each row when(old.status in ('pending','buy_in_open') and new.status in ('completed','late'))
execute function first_doji_badges_private.record_completion();

create or replace function public.get_my_first_doji_wins_v1()
returns bigint language plpgsql stable security definer set search_path='' as $$
declare viewer uuid:=auth.uid(); result bigint;
begin
  if viewer is null or not exists(select 1 from public.profiles where id=viewer and is_banned is not true)
    then raise exception 'Not authenticated' using errcode='42501'; end if;
  select wins into result from first_doji_badges_private.counts where user_id=viewer;
  return coalesce(result,0);
end;
$$;
revoke all on function public.get_my_first_doji_wins_v1() from public,anon,authenticated,service_role;
grant execute on function public.get_my_first_doji_wins_v1() to authenticated;

-- Keep the existing authorized response shape. A confirmed overall claim wins
-- timestamp ties/races when visible; personalized fallback never awards credit.
create or replace function public.get_first_doji_v1(p_daily_event_id uuid, p_audience text default 'friends')
returns jsonb language plpgsql stable security definer set search_path='' as $$
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
  select u.* into winner from first_doji_badges_private.winners w
    join public.user_events u on u.id=w.user_event_id and u.user_id=w.user_id
    where w.daily_event_id=p_daily_event_id and u.status in ('completed','late')
      and first_doji_private.visible(u,viewer)
      and (p_audience='everyone' or u.user_id=viewer or exists(
        select 1 from public.friendships f where f.status='accepted'
          and ((f.requester_id=viewer and f.addressee_id=u.user_id)
            or (f.addressee_id=viewer and f.requester_id=u.user_id))));
  if winner.id is null then
    if p_audience='friends' then
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
  end if;
  if winner.id is null then return null; end if;
  select jsonb_build_object('daily_event_id',p_daily_event_id,'audience',p_audience,
    'completed_at',winner.completed_at,'profile',jsonb_build_object('id',p.id,'username',p.username,
      'display_name',p.display_name,'avatar_url',p.avatar_url,'equipped_border_key',p.equipped_border_key))
    into result from public.profiles p where p.id=winner.user_id;
  return result;
end;
$$;
revoke all on function public.get_first_doji_v1(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.get_first_doji_v1(uuid,text) to authenticated;
commit;
