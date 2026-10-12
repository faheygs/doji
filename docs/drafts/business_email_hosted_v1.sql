-- Business-only one-shot wakeup. No cron, polling, member trigger or relay changes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create table business_private.email_sender_settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 signing_key text check(signing_key ~ '^[a-f0-9]{64}$')
);
insert into business_private.email_sender_settings(singleton) values(true);
alter table business_private.email_sender_settings enable row level security;
revoke all on business_private.email_sender_settings from public,anon,authenticated,service_role,
 doji_employee,doji_business,doji_identity_resolver,doji_business_mail;
alter table business_private.email_outbox add column wake_nonce uuid not null default gen_random_uuid();
alter table business_private.email_outbox add column wake_request_id bigint;
alter table business_private.email_outbox add column wake_failed boolean not null default false;

create function business_private.wake_application_email() returns trigger
language plpgsql security definer set search_path='' as $$
declare key text; expires bigint; body jsonb; signature text; request_id bigint;
begin
 select s.signing_key into key from business_private.email_sender_settings s
 where s.singleton and s.enabled and exists(select 1 from business_private.email_settings e
  where e.singleton and e.sending_enabled and e.capacity_verified_until>clock_timestamp());
 if key is null then return new;end if;
 expires:=extract(epoch from clock_timestamp())::bigint+120;
 signature:=encode(extensions.hmac(new.id::text||'|'||new.wake_nonce::text||'|'||expires::text,key,'sha256'),'hex');
 body:=jsonb_build_object('id',new.id,'nonce',new.wake_nonce,'expires',expires,'signature',signature);
 -- Only short-lived, exact-job signatures enter pg_net, never provider/DB keys.
 -- pg_net starts this bounded request after commit, not inside the application RPC.
 begin
  select net.http_post(url:='https://tvixsmqxotuvyjqzmjla.supabase.co/functions/v1/business-application-mail',
   body:=body,headers:='{"Content-Type":"application/json"}'::jsonb,timeout_milliseconds:=20000) into request_id;
  update business_private.email_outbox set wake_request_id=request_id where id=new.id;
 exception when others then
  update business_private.email_outbox set wake_failed=true where id=new.id;
 end;
 return new;
end$$;
create trigger business_application_email_wakeup after insert on business_private.email_outbox
 for each row execute function business_private.wake_application_email();

create function business_private.claim_application_email(p_id uuid,p_nonce uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare cfg business_private.email_settings%rowtype; job business_private.email_outbox%rowtype;
 subject text; issuer text; audience text; utc_day date; utc_month date; token uuid;
begin
 select * into cfg from business_private.email_settings where singleton for update;
 if not found or not cfg.sending_enabled or cfg.capacity_verified_until is null or cfg.capacity_verified_until<=clock_timestamp() then return null;end if;
 utc_day:=(clock_timestamp() at time zone 'UTC')::date;
 utc_month:=date_trunc('month',utc_day)::date;
 if cfg.day is distinct from utc_day then cfg.day_used:=0;end if;
 if cfg.month is distinct from utc_month then cfg.month_used:=0;end if;
 if cfg.day_used>=cfg.daily_limit or cfg.month_used>=cfg.monthly_limit then return null;end if;
 select q.* into job from business_private.email_outbox q
 join business_private.accounts b on b.id=q.applicant_id and not b.disabled
 join portal_identity_private.principals p on p.id=b.id and p.realm='business' and p.state='active'
 join portal_identity_private.identities i on i.principal_id=p.id and i.realm='business' and not i.revoked
 join portal_identity_private.realms r on r.realm=i.realm and r.enabled
 where q.id=p_id and q.wake_nonce=p_nonce and q.status='queued'
  and q.occurred_at>clock_timestamp()-interval '24 hours'
 for update of q skip locked;
 if not found then return null;end if;
 select i.subject,r.issuer,r.audience into strict subject,issuer,audience
 from portal_identity_private.identities i join portal_identity_private.realms r on r.realm=i.realm
 where i.principal_id=job.applicant_id and i.realm='business' and not i.revoked and r.enabled;
 token:=gen_random_uuid();
 update business_private.email_outbox set status='claimed',lease_token=token,claimed_at=clock_timestamp() where id=job.id;
 update business_private.email_settings set day=utc_day,day_used=cfg.day_used+1,month=utc_month,month_used=cfg.month_used+1 where singleton;
 return jsonb_build_object('id',job.id,'lease_token',token,'application_id',job.application_id,
  'revision',job.revision,'kind',job.kind,'occurred_at',job.occurred_at,'subject',subject,'issuer',issuer,'audience',audience);
end$$;
revoke all on function business_private.wake_application_email(),business_private.claim_application_email(uuid,uuid)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_mail;
grant execute on function business_private.claim_application_email(uuid,uuid) to doji_business_mail;
-- Dedicated NOINHERIT LOGIN is provisioned separately into the protected runtime.
commit;
