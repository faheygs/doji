-- Preparation only: one exact occurrence, no scheduler, repairs or member writes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create schema doji_readiness_private;
revoke all on schema doji_readiness_private from public,anon,authenticated,service_role;
create table doji_readiness_private.settings(
 id boolean primary key default true check(id), enabled boolean not null default false
);
insert into doji_readiness_private.settings(id) values(true);
alter table doji_readiness_private.settings enable row level security;
revoke all on doji_readiness_private.settings from public,anon,authenticated,service_role;

create function public.inspect_doji_readiness_v1(p_event_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' set statement_timeout='1s' set lock_timeout='100ms' as $$
declare event public.daily_events%rowtype; challenge public.challenges%rowtype;
 observed timestamptz:=statement_timestamp(); phase text; issues text[]:=array[]::text[];
 option_count integer; other_count integer; invalid_option boolean; positions integer;
 card_present boolean; card_valid boolean; options_state text:='not_required'; card_state text:='not_required';
begin
 if not coalesce((select enabled from doji_readiness_private.settings where id),false) then
  return jsonb_build_object('enabled',false);end if;
 select * into event from public.daily_events where id=p_event_id;
 if not found then return jsonb_build_object('enabled',true,'observed_at',observed,'state','missing');end if;
 select * into challenge from public.challenges where id=event.challenge_id;
 if not found then return jsonb_build_object('enabled',true,'observed_at',observed,'state','unavailable');end if;
 phase:=case when event.closed_at is not null then 'closed'
  when event.activated_at is null and event.fires_at>observed then 'scheduled'
  when event.activated_at is null then 'awaiting_activation'
  when event.closes_at<=observed then 'elapsed' else 'live' end;
 if not isfinite(event.fires_at) or event.window_minutes<1 then issues:=array_append(issues,'invalid_schedule');end if;
 if event.activated_at is not null and (not isfinite(event.activated_at) or event.activated_at>observed
   or event.closes_at is null or not isfinite(event.closes_at) or event.closes_at<=event.activated_at
   or event.closes_at>event.activated_at+interval '10 minutes') then
  issues:=array_append(issues,'invalid_participation_window');end if;
 if challenge.type='poll' then
  -- The existing challenge/position index bounds work; oversized sets stay unqualified.
  select count(*),count(*) filter(where o.is_other),bool_or(length(btrim(o.text))=0),count(distinct o.position)
   into option_count,other_count,invalid_option,positions
   from (select text,is_other,position from public.poll_options where challenge_id=event.challenge_id
     order by position limit 17) o;
  options_state:=case when option_count>16 then 'limited'
   when option_count<2 or invalid_option or positions<>option_count or other_count>1
     or coalesce(challenge.poll_kind not in ('poll','wyr'),true)
     or (challenge.poll_kind='wyr' and (option_count<>2 or other_count<>0)) then 'invalid'
   else 'verified' end;
  if options_state='invalid' then issues:=array_append(issues,'invalid_poll_options');end if;
  -- Scheduling-time cards may legitimately disappear. Activation owns their creation.
  card_state:='not_checked_before_activation';
  if phase='live' then
   select true,p.type='poll_vote' and p.user_id is null and p.user_event_id is null
     and p.visibility='public' and p.moderation_status='visible'
    into card_present,card_valid from public.posts p
    where p.daily_event_id=event.id and p.is_community_poll=true;
   card_state:=case when not coalesce(card_present,false) then 'missing'
    when not coalesce(card_valid,false) then 'unavailable' else 'verified' end;
   if card_state<>'verified' then issues:=array_append(issues,'poll_card_unavailable');end if;
  elsif phase in ('closed','elapsed') then card_state:='not_checked_after_window';end if;
 end if;
 return jsonb_build_object('enabled',true,'observed_at',observed,'state',
  case when cardinality(issues)>0 then 'needs_attention' when options_state='limited' then 'limited' else 'checked' end,
  'phase',phase,'scheduled_at',event.fires_at,'activated_at',event.activated_at,'closes_at',event.closes_at,
  'poll_options',options_state,'poll_card',card_state,'issues',to_jsonb(issues));
end$$;
revoke all on function public.inspect_doji_readiness_v1(uuid) from public,anon,authenticated,service_role;
do $$declare role_name text;begin
 for role_name in select rolname from pg_roles where rolname in
  ('doji_employee','doji_employee_application','doji_business','doji_identity_resolver') loop
  execute format('revoke all on function public.inspect_doji_readiness_v1(uuid) from %I',role_name);
 end loop;
end$$;
grant execute on function public.inspect_doji_readiness_v1(uuid) to service_role;
commit;
