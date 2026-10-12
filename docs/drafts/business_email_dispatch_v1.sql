-- LOCAL CANDIDATE. Add before enabling the separately gated sender.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter table business_private.email_outbox add column dispatch_authorized boolean not null default false;
create function business_private.authorize_application_email(p_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare job business_private.email_outbox%rowtype; subject text; issuer text; audience text;
begin
 perform 1 from business_private.email_settings where singleton and sending_enabled
  and capacity_verified_until>clock_timestamp() for share;
 if not found then return null; end if;
 select * into job from business_private.email_outbox where id=p_id and lease_token=p_token
  and status='claimed' and not dispatch_authorized and claimed_at>clock_timestamp()-interval '1 minute' for update;
 if not found then return null; end if;
 select i.subject,r.issuer,r.audience into subject,issuer,audience
 from business_private.applications a
 join business_private.accounts b on b.id=a.applicant_id and not b.disabled
 join portal_identity_private.principals p on p.id=b.id and p.realm='business' and p.state='active'
 join portal_identity_private.identities i on i.principal_id=p.id and i.realm='business' and not i.revoked
 join portal_identity_private.realms r on r.realm=i.realm and r.enabled
 where a.id=job.application_id and a.applicant_id=job.applicant_id and a.revision=job.revision
  and a.state=case job.kind when 'approve' then 'approved' when 'submit' then 'pending'
   when 'decline' then 'declined' when 'request_changes' then 'changes_requested' when 'reopen' then 'changes_requested' end;
 if not found then
  update business_private.email_outbox set status='cancelled',lease_token=null where id=job.id;
  return null;
 end if;
 -- One-use authorization persists before provider I/O. No automatic resend,
 -- including after a lost provider response or a sender crash.
 update business_private.email_outbox set dispatch_authorized=true where id=job.id;
 return jsonb_build_object('id',job.id,'application_id',job.application_id,'kind',job.kind,
  'subject',subject,'issuer',issuer,'audience',audience);
end$$;
revoke all on function business_private.authorize_application_email(uuid,uuid)
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_mail;
grant execute on function business_private.authorize_application_email(uuid,uuid) to doji_business_mail;
commit;
