-- Owner-approved persistent access for the already-created exact test identity.
-- Does not extend registration, enrollment, email capacity or session lifetimes.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
alter table business_session_private.owned_auth_acceptance
 add column existing_account_access boolean not null default false;
alter table business_session_private.owned_auth_acceptance
 add constraint owned_existing_account_requires_reservation
 check(not existing_account_access or reserved_at is not null);
create or replace function business_session_private.admit_owned_acceptance_v1(
 p_scope text,p_action text,p_attempt text,p_identity text,p_network text
) returns jsonb language plpgsql security definer set search_path=''
set lock_timeout='1s' set statement_timeout='3s' as $$
begin
 perform business_session_private.owned_auth_lock_v1(p_scope);
 if not exists(select 1 from business_session_private.owned_auth_acceptance
  where singleton and enabled and scope_hash=p_scope and identity_hmac=p_identity
   and started_at<=clock_timestamp()
   and (expires_at>clock_timestamp() or
    (existing_account_access and reserved_at is not null
     and p_action in ('signin','verify','mfa','recover','reset')))) then
  return jsonb_build_object('state','denied');end if;
 return business_session_private.admit_owned_auth_v1(p_scope,p_action,p_attempt,p_identity,p_network);
end$$;
commit;
