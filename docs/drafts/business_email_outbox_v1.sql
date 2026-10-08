-- LOCAL CANDIDATE ONLY. Separate approval/capacity review required for deployment.
-- No provider calls, cron, network, credentials, member triggers or automatic sender.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create role doji_business_mail nologin noinherit;
grant usage on schema business_private to doji_business_mail;
create table business_private.email_settings (
 singleton boolean primary key default true check(singleton),
 capture_enabled boolean not null default false,
 sending_enabled boolean not null default false,
 capacity_verified_until timestamptz,
 daily_limit integer not null default 0 check(daily_limit between 0 and 100),
 monthly_limit integer not null default 0 check(monthly_limit between 0 and 3000),
 day date, day_used integer not null default 0 check(day_used>=0),
 month date, month_used integer not null default 0 check(month_used>=0)
);
insert into business_private.email_settings(singleton) values(true);
create table business_private.email_outbox (
 id uuid primary key default gen_random_uuid(),
 application_id uuid not null references business_private.applications(id) on delete cascade,
 applicant_id uuid not null references business_private.accounts(id) on delete cascade,
 revision bigint not null check(revision>0),
 kind text not null check(kind in ('submit','approve','decline','request_changes','reopen')),
 occurred_at timestamptz not null,
 status text not null default 'queued' check(status in ('queued','claimed','accepted','uncertain','cancelled')),
 lease_token uuid, claimed_at timestamptz,
 provider_id text check(length(provider_id) between 1 and 160 and provider_id !~ '[[:cntrl:]]'),
 unique(application_id,revision)
);
create index business_email_waiting on business_private.email_outbox(occurred_at,id) where status='queued';
alter table business_private.email_settings enable row level security;
alter table business_private.email_outbox enable row level security;
revoke all on business_private.email_settings,business_private.email_outbox
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_business_mail;

-- Atomic with the existing successful history write. No duplicate mail on RPC replay.
-- The only producer is the business history table, never public/member tables.
create function business_private.capture_application_email() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.action not in ('submit','approve','decline','request_changes','reopen') then return new; end if;
 if not exists(select 1 from business_private.email_settings where singleton and capture_enabled) then return new; end if;
 insert into business_private.email_outbox(application_id,applicant_id,revision,kind,occurred_at)
 select a.id,a.applicant_id,new.revision,new.action,new.occurred_at
 from business_private.applications a
 join business_private.accounts b on b.id=a.applicant_id and not b.disabled
 join portal_identity_private.principals p on p.id=b.id and p.realm='business' and p.state='active'
 join portal_identity_private.identities i on i.principal_id=p.id and i.realm='business' and not i.revoked
 where a.id=new.application_id
 on conflict(application_id,revision) do nothing;
 return new;
end$$;
create trigger business_application_email after insert on business_private.history
 for each row execute function business_private.capture_application_email();

-- One bounded claim. No emails stored or looked up in member Auth. Sender must
-- use this exact pinned WorkOS business directory/subject and recheck verification.
-- Expired/ambiguous claims are NEVER automatically retried (provider may have sent).
create function business_private.claim_application_email() returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg business_private.email_settings%rowtype; job business_private.email_outbox%rowtype;
 subject text; issuer text; audience text; utc_day date; utc_month date; token uuid;
begin
 select * into cfg from business_private.email_settings where singleton for update;
 if not found or not cfg.sending_enabled or cfg.capacity_verified_until is null or cfg.capacity_verified_until<=clock_timestamp() then return null; end if;
 utc_day:=(clock_timestamp() at time zone 'UTC')::date;
 utc_month:=date_trunc('month',utc_day)::date;
 if cfg.day is distinct from utc_day then cfg.day_used:=0; end if;
 if cfg.month is distinct from utc_month then cfg.month_used:=0; end if;
 if cfg.day_used>=cfg.daily_limit or cfg.month_used>=cfg.monthly_limit then return null; end if;
 select q.* into job from business_private.email_outbox q
 join business_private.accounts b on b.id=q.applicant_id and not b.disabled
 join portal_identity_private.principals p on p.id=b.id and p.realm='business' and p.state='active'
 join portal_identity_private.identities i on i.principal_id=p.id and i.realm='business' and not i.revoked
 join portal_identity_private.realms r on r.realm=i.realm and r.enabled
 where q.status='queued' and q.occurred_at>clock_timestamp()-interval '24 hours'
 order by q.occurred_at,q.id limit 1 for update of q skip locked;
 if not found then return null; end if;
 select i.subject,r.issuer,r.audience into strict subject,issuer,audience
 from portal_identity_private.identities i join portal_identity_private.realms r on r.realm=i.realm
 where i.principal_id=job.applicant_id and i.realm='business' and not i.revoked and r.enabled;
 token:=gen_random_uuid();
 update business_private.email_outbox set status='claimed',lease_token=token,claimed_at=clock_timestamp() where id=job.id;
 update business_private.email_settings set day=utc_day,day_used=cfg.day_used+1,
  month=utc_month,month_used=cfg.month_used+1 where singleton;
 return jsonb_build_object('id',job.id,'lease_token',token,'application_id',job.application_id,
  'revision',job.revision,'kind',job.kind,'occurred_at',job.occurred_at,
  'subject',subject,'issuer',issuer,'audience',audience);
end$$;

-- Provider acceptance is not delivery; a timeout is uncertain, never 'sent'.
create function business_private.finish_application_email(p_id uuid,p_token uuid,p_status text,p_provider_id text default null)
returns void language plpgsql security definer set search_path='' as $$begin
 if p_status is null or p_status not in ('accepted','uncertain','cancelled')
  or (p_status='accepted' and (p_provider_id is null or length(p_provider_id) not between 1 and 160))
  or (p_status<>'accepted' and p_provider_id is not null) then
  raise exception using errcode='22023',message='Invalid email result'; end if;
 update business_private.email_outbox set status=p_status,provider_id=p_provider_id,lease_token=null
 where id=p_id and lease_token=p_token and status='claimed';
 if not found then raise exception using errcode='PT409',message='Email claim unavailable'; end if;
end$$;
revoke all on function business_private.capture_application_email(),business_private.claim_application_email(),
 business_private.finish_application_email(uuid,uuid,text,text)
 from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver,doji_business_mail;
grant execute on function business_private.claim_application_email(),business_private.finish_application_email(uuid,uuid,text,text) to doji_business_mail;
-- No LOGIN, authenticator membership, provider implementation or enabled switches.
commit;
