-- Portal-only durable admission. No member rate-limit tables or plaintext PII.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table employee_session_private.login_admission (
 kind text not null check(kind in ('global','email','ip')),
 key_hash text not null check(key_hash ~ '^[a-f0-9]{64}$'),
 window_start timestamptz not null,
 attempts integer not null check(attempts between 1 and 20),
 primary key(kind,key_hash)
);
alter table employee_session_private.login_admission enable row level security;
revoke all on employee_session_private.login_admission from public,anon,authenticated,doji_employee,doji_business,service_role,doji_employee_session,doji_employee_application,doji_identity_resolver;
create function employee_session_private.admit_login_v1(p_scope text,p_email_hash text,p_ip_hash text)
returns boolean language plpgsql security definer set search_path='' set lock_timeout='1s' set statement_timeout='3s' as $$
declare cfg employee_session_private.settings%rowtype; stamp timestamptz; k text; h text; cap integer;
begin
 if p_scope is null or p_scope !~ '^[a-f0-9]{64}$' or p_email_hash is null or p_email_hash !~ '^[a-f0-9]{64}$'
  or p_ip_hash is null or p_ip_hash !~ '^[a-f0-9]{64}$' then
  raise exception using errcode='22023',message='Invalid login admission';end if;
 select * into strict cfg from employee_session_private.settings where singleton for update;
 if not cfg.enabled or cfg.scope_hash is distinct from p_scope then raise exception using errcode='42501',message='Employee sign-in disabled';end if;
 stamp:=clock_timestamp();
 -- Hard cardinality cap and on-demand expiry; never a member-traffic scan/job.
 delete from employee_session_private.login_admission where window_start<=stamp-interval '10 minutes';
 if (select count(*) from employee_session_private.login_admission)>125 then return false;end if;
 -- Check all three before incrementing. The settings lock serializes contenders.
 foreach k in array array['global','email','ip'] loop
  h:=case k when 'global' then repeat('0',64) when 'email' then p_email_hash else p_ip_hash end;
  cap:=case k when 'global' then 20 when 'email' then 5 else 10 end;
  if exists(select 1 from employee_session_private.login_admission where kind=k and key_hash=h and attempts>=cap) then return false;end if;
 end loop;
 foreach k in array array['global','email','ip'] loop
  h:=case k when 'global' then repeat('0',64) when 'email' then p_email_hash else p_ip_hash end;
  insert into employee_session_private.login_admission(kind,key_hash,window_start,attempts) values(k,h,stamp,1)
   on conflict(kind,key_hash) do update set attempts=employee_session_private.login_admission.attempts+1;
 end loop;
 return true;
end$$;
revoke all on function employee_session_private.admit_login_v1(text,text,text) from public,anon,authenticated,doji_employee,doji_business,service_role,doji_employee_application,doji_identity_resolver;
grant execute on function employee_session_private.admit_login_v1(text,text,text) to doji_employee_session;
commit;
