-- LOCAL ONLY; apply after intake draft. No scheduler is activated here.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter table public.safety_removal_alerts add column lease_id uuid,
 add column lease_until timestamptz, add column first_attempt_at timestamptz,
 add column next_attempt_at timestamptz not null default clock_timestamp(),
 add column envelope jsonb,
 add column provider_delivery_status text check(provider_delivery_status in ('delivered','queued','bounced','suppressed','rejected','uncertain'));
create index safety_removal_pending_alerts_idx on public.safety_removal_alerts(next_attempt_at,created_at) where state='pending';

create function public.claim_safety_removal_alerts_v1(p_envelope jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.safety_removal_alerts%rowtype; results jsonb:='[]'; t timestamptz:=clock_timestamp();
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service required'; end if;
 if jsonb_typeof(p_envelope) is distinct from 'object' or p_envelope-array['from','to']<>'{}'
  or p_envelope->>'to' is distinct from 'faheygs@gmail.com'
  or jsonb_typeof(p_envelope->'from') is distinct from 'string'
  or length(p_envelope->>'from') not between 3 and 200 then raise exception 'Invalid alert envelope'; end if;
 -- Operational retry ceiling, NOT a provider idempotency guarantee. Cloudflare
 -- does not document send deduplication; ambiguous retries can duplicate mail.
 update public.safety_removal_alerts set state='needs_attention',lease_id=null,lease_until=null
 where state='pending' and (attempts>=24 or first_attempt_at<t-interval '23 hours') and coalesce(lease_until,t)<=t;
 for a in select * from public.safety_removal_alerts where state='pending' and next_attempt_at<=t
  and coalesce(lease_until,t)<=t order by next_attempt_at,created_at limit 3 for update skip locked loop
  update public.safety_removal_alerts set lease_id=gen_random_uuid(),lease_until=t+interval '2 minutes',
   attempts=attempts+1,last_attempt_at=t,first_attempt_at=coalesce(first_attempt_at,t),envelope=coalesce(envelope,p_envelope)
   where case_id=a.case_id returning * into a;
  results:=results||jsonb_build_array(jsonb_build_object('id',a.case_id,'lease_id',a.lease_id,
    'deadline_at',(select deadline_at from public.safety_removal_cases where id=a.case_id),
    'queue',(select queue from public.safety_removal_cases where id=a.case_id),'envelope',a.envelope));
 end loop;
 return results;
end$$;

create function public.finish_safety_removal_alert_v1(p_id uuid,p_lease_id uuid,p_provider_id text default null,p_terminal boolean default false,p_delivery_status text default 'uncertain')
returns boolean language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if coalesce(auth.role(),'')<>'service_role' then raise exception using errcode='42501',message='Service required'; end if;
 if p_terminal is null or p_delivery_status is null or p_delivery_status not in ('delivered','queued','bounced','suppressed','rejected','uncertain')
  or (p_provider_id is not null and (length(p_provider_id) not between 1 and 254 or p_provider_id ~ '[[:space:][:cntrl:]]'))
  or ((p_provider_id is not null) is distinct from (p_delivery_status in ('delivered','queued')))
  or (p_terminal and p_provider_id is not null)
  or (p_delivery_status in ('bounced','suppressed') and not p_terminal) then raise exception 'Invalid acknowledgment'; end if;
 update public.safety_removal_alerts set state=case when p_provider_id is not null then 'accepted'
  when p_terminal or attempts>=24 then 'needs_attention' else 'pending' end,
  provider_id=p_provider_id,provider_delivery_status=p_delivery_status,lease_id=null,lease_until=null,
  next_attempt_at=clock_timestamp()+make_interval(secs=>least(1800,60*(2^least(attempts,5))::integer))
 where case_id=p_id and lease_id=p_lease_id and lease_until>clock_timestamp() and state='pending';
 get diagnostics changed=row_count;
 return changed=1;
end$$;
revoke all on function public.claim_safety_removal_alerts_v1(jsonb),public.finish_safety_removal_alert_v1(uuid,uuid,text,boolean,text) from public,anon,authenticated,doji_employee,service_role;
grant execute on function public.claim_safety_removal_alerts_v1(jsonb),public.finish_safety_removal_alert_v1(uuid,uuid,text,boolean,text) to service_role;
commit;
