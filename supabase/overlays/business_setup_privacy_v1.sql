-- LOCAL ONLY: install with business_setup_v1 before enabling branding writes.
-- Additive private contracts; preserves existing privacy authorization/holds.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create function portal_identity_private.export_business_setup_target(
 p_case uuid,p_revision bigint,p_issuer text,p_audience text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare target jsonb; brand jsonb;
begin
 target:=portal_identity_private.export_business_identity_target(p_case,p_revision,p_issuer,p_audience);
 perform 1 from business_private.accounts where id=(target->>'account_id')::uuid for share;
 select jsonb_build_object('organization_id',p.organization_id,'revision',p.revision,
   'details',p.details,'completed_at',p.completed_at,'updated_at',p.updated_at)
 into brand from business_private.brand_profiles p
 join business_private.organizations o on o.id=p.organization_id
 join business_private.applications a on a.id=o.application_id
 where a.applicant_id=(target->>'account_id')::uuid;
 return target||jsonb_build_object('brand_profile',brand);
end$$;
-- Inside the existing authorized erasure transaction, after its provider/hold
-- checks. Does not start an erasure or grant a new erasure capability.
create function business_private.erase_setup_for_privacy() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.kind='erasure' and new.state='primary_erased' and old.state='executing' then
  delete from business_private.setup_receipts r where r.actor_id=new.account_id
   or r.organization_id in (select o.id from business_private.organizations o
    join business_private.applications a on a.id=o.application_id where a.applicant_id=new.account_id);
  delete from business_private.brand_profiles p using business_private.organizations o,business_private.applications a
   where p.organization_id=o.id and o.application_id=a.id and a.applicant_id=new.account_id;
 end if;
 return new;
end$$;
create trigger business_setup_privacy_erasure after update of state on business_private.privacy_cases
 for each row execute function business_private.erase_setup_for_privacy();
revoke all on function portal_identity_private.export_business_setup_target(uuid,bigint,text,text),
 business_private.erase_setup_for_privacy()
 from public,anon,authenticated,service_role,doji_employee,doji_business,doji_identity_resolver,doji_business_session,doji_business_enrollment;
-- Retain cleanup on setup rollback: retained personal data remains covered.
commit;
