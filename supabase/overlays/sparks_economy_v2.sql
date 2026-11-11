-- Candidate only. Compose with sparks_economy_v2.bindings.sql in one transaction.
-- No activation, history backfill, balance rewrite or shop-price change.
begin;
set local lock_timeout='2s';
do $$ begin
  if to_regnamespace('sparks_economy_v2_private') is not null then
    raise exception 'Economy v2 already exists; inspect its release state, never replay'; end if;
  if to_regclass('first_doji_badges_private.winners') is null then
    raise exception 'Qualified canonical first-Doji ledger required'; end if;
end $$;
create schema sparks_economy_v2_private;
revoke all on schema sparks_economy_v2_private from public,anon,authenticated;
create table sparks_economy_v2_private.settings (
  singleton boolean primary key default true check(singleton), enabled_from timestamptz
);
insert into sparks_economy_v2_private.settings values(true,null);
-- Opaque content/event IDs survive content retention; account deletion removes private history.
create table sparks_economy_v2_private.receipts (
  user_id uuid references auth.users(id) on delete cascade,
  kind text not null check(kind in ('completion','first','comment','reaction')),
  subject uuid not null, amount integer not null check(amount>=0),
  primary key(user_id,kind,subject)
);
create table sparks_economy_v2_private.social_totals (
  user_id uuid references auth.users(id) on delete cascade,
  daily_event_id uuid not null, earned integer not null default 0 check(earned between 0 and 5),
  primary key(user_id,daily_event_id)
);
create table sparks_economy_v2_private.levels (
  user_id uuid primary key references auth.users(id) on delete cascade,
  highest integer not null check(highest>=1)
);
create table sparks_economy_v2_private.originals (
  signature text primary key, definition text not null, installed_hash text
);
alter table sparks_economy_v2_private.settings enable row level security;
alter table sparks_economy_v2_private.receipts enable row level security;
alter table sparks_economy_v2_private.social_totals enable row level security;
alter table sparks_economy_v2_private.levels enable row level security;
alter table sparks_economy_v2_private.originals enable row level security;
revoke all on all tables in schema sparks_economy_v2_private from public,anon,authenticated;

create function sparks_economy_v2_private.enabled() returns boolean
language sql stable set search_path='' as $$
  select coalesce(enabled_from<=now(),false) from sparks_economy_v2_private.settings where singleton;
$$;
create function sparks_economy_v2_private.applies(event_id uuid) returns boolean
language sql stable set search_path='' as $$
  select exists(select 1 from public.daily_events e cross join sparks_economy_v2_private.settings s
    where e.id=event_id and s.singleton and s.enabled_from<=now() and e.fires_at>=s.enabled_from);
$$;
create function sparks_economy_v2_private.completion_amount(elapsed_seconds numeric, paid boolean)
returns integer language sql immutable set search_path='' as $$
  select case when elapsed_seconds is null or elapsed_seconds<0 or paid is null then 0
    when paid then 5 when elapsed_seconds<=60 then 20 when elapsed_seconds<=180 then 17
    when elapsed_seconds<=360 then 13 else 10 end;
$$;
create function sparks_economy_v2_private.claim(actor uuid,kind text,subject uuid,amount integer,reason text)
returns void language plpgsql set search_path='' as $$
declare claimed uuid;
begin
  -- Consistent per-member lock order; no global daily balance row.
  perform 1 from public.profiles where id=actor for update;
  insert into sparks_economy_v2_private.receipts values(actor,kind,subject,amount)
    on conflict do nothing returning user_id into claimed;
  if claimed is not null and amount>0 then
    perform public.award_sparks(actor,amount,reason,'economy_v2:'||kind||':'||subject::text);
  end if;
end $$;
create function sparks_economy_v2_private.complete(participant public.user_events) returns boolean
language plpgsql set search_path='' as $$
declare started timestamptz; elapsed numeric;
begin
  if not sparks_economy_v2_private.applies(participant.daily_event_id) then return false; end if;
  if not exists(select 1 from public.profiles where id=participant.user_id
    and is_banned is not true and is_demo_account is not true) then return true; end if;
  select greatest(fires_at,activated_at) into started from public.daily_events where id=participant.daily_event_id;
  elapsed:=extract(epoch from clock_timestamp()-started);
  perform sparks_economy_v2_private.claim(participant.user_id,'completion',participant.id,
    sparks_economy_v2_private.completion_amount(elapsed,participant.buy_in_at is not null),'challenge_complete');
  return true;
end $$;
create function sparks_economy_v2_private.first_bonus() returns trigger
language plpgsql security definer set search_path='' as $$
declare participant public.user_events; elapsed numeric;
begin
  if not sparks_economy_v2_private.applies(new.daily_event_id) then return new; end if;
  select * into participant from public.user_events where id=new.user_event_id and user_id=new.user_id;
  if participant.id is null or participant.buy_in_at is not null then return new; end if;
  select extract(epoch from clock_timestamp()-greatest(fires_at,activated_at)) into elapsed
    from public.daily_events where id=new.daily_event_id;
  if elapsed between 0 and 600 then
    perform sparks_economy_v2_private.claim(new.user_id,'first',new.daily_event_id,5,'challenge_complete');
  end if;
  return new;
end $$;
create trigger economy_v2_first_bonus after insert on first_doji_badges_private.winners
for each row execute function sparks_economy_v2_private.first_bonus();

create function sparks_economy_v2_private.social(actor uuid,post_id uuid,kind text) returns boolean
language plpgsql set search_path='' as $$
declare event_id uuid; owner_id uuid; current_total integer; amount integer; claimed uuid;
begin
  select p.daily_event_id,p.user_id into event_id,owner_id from public.posts p where p.id=post_id;
  if not sparks_economy_v2_private.applies(event_id) then return false; end if;
  if owner_id=actor or not exists(select 1 from public.profiles where id=actor
    and is_banned is not true and is_demo_account is not true) then return true; end if;
  if not exists(select 1 from public.user_events where user_id=actor and daily_event_id=event_id
    and status in ('completed','late')) then return true; end if;
  amount:=case kind when 'comment' then 3 when 'reaction' then 2 else 0 end;
  if amount=0 then raise exception 'Unknown social reward'; end if;
  perform 1 from public.profiles where id=actor for update;
  insert into sparks_economy_v2_private.social_totals values(actor,event_id,0) on conflict do nothing;
  select earned into current_total from sparks_economy_v2_private.social_totals
    where user_id=actor and daily_event_id=event_id for update;
  -- Whole rewards only: a 3-Spark comment never silently becomes 1 Spark.
  if current_total+amount>5 then return true; end if;
  insert into sparks_economy_v2_private.receipts values(actor,kind,post_id,amount)
    on conflict do nothing returning user_id into claimed;
  if claimed is not null then
    update sparks_economy_v2_private.social_totals set earned=earned+amount
      where user_id=actor and daily_event_id=event_id;
    perform public.award_sparks(actor,amount,kind,'economy_v2:'||kind||':'||post_id::text);
  end if;
  return true;
end $$;

create function sparks_economy_v2_private.level_reward(actor uuid,previous integer,reached integer)
returns boolean language plpgsql set search_path='' as $$
declare highest_paid integer; amount integer;
begin
  if not sparks_economy_v2_private.enabled() then return false; end if;
  if not exists(select 1 from public.profiles where id=actor and is_banned is not true
    and is_demo_account is not true) then return true; end if;
  if previous is null or reached is null then return true; end if;
  perform 1 from public.profiles where id=actor for update;
  -- Record the prior high-water mark even when the first observed change is a downgrade.
  insert into sparks_economy_v2_private.levels values(actor,greatest(1,previous))
    on conflict(user_id) do update set highest=greatest(sparks_economy_v2_private.levels.highest,excluded.highest)
    returning highest into highest_paid;
  if reached<=highest_paid then return true; end if;
  -- Sum each newly crossed level once, without a per-level loop or retroactive top-up.
  amount:=(5::bigint*(reached::bigint*(reached+1)-highest_paid::bigint*(highest_paid+1)))::integer;
  update sparks_economy_v2_private.levels set highest=reached where user_id=actor;
  perform public.award_sparks(actor,amount,'level_up','economy_v2:levels:'||(highest_paid+1)||'-'||reached);
  return true;
end $$;
-- UPDATE OF level alone misses levels derived by the BEFORE UPDATE XP trigger.
-- The legacy trigger stays intact for rollback; the private high-water mark deduplicates both paths.
create function sparks_economy_v2_private.derived_level_reward() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform sparks_economy_v2_private.level_reward(new.id,old.level,new.level);
  return new;
end $$;
create trigger economy_v2_derived_level_reward after update on public.profiles
for each row when(old.level is distinct from new.level)
execute function sparks_economy_v2_private.derived_level_reward();
revoke all on all functions in schema sparks_economy_v2_private from public,anon,authenticated;
-- The binding file below owns the only changes to existing functions and COMMIT.
