-- LOCAL PREPARATION ONLY. NOT an automatic migration or a cutover.
-- No provider configuration, existing function replacement, Auth/profile write,
-- authenticator membership, API role grant, schedule or event producer.
begin;
set local lock_timeout='2s';
set local statement_timeout='8s';
create role doji_identity_resolver nologin noinherit;
create schema portal_identity_private;
revoke all on schema portal_identity_private from public,anon,authenticated,doji_employee,doji_business,service_role;
create table portal_identity_private.realms (
 realm text primary key check(realm in ('employee','business')),
 enabled boolean not null default false,
 issuer text not null check(length(issuer) between 9 and 512 and issuer ~ '^https://[^[:space:]]+$'),
 audience text not null check(length(audience) between 1 and 256 and audience !~ '[[:cntrl:][:space:]]'),
 unique(issuer,audience)
);
-- No trusted issuer rows are seeded. Different applications within one directory
-- do NOT isolate accounts. Provider directory and key evidence are release gates.
create table portal_identity_private.principals (
 id uuid primary key,
 realm text not null references portal_identity_private.realms(realm),
 state text not null default 'pending' check(state in ('pending','active','disabled','deleted')),
 revision bigint not null default 1 check(revision>0),
 created_at timestamptz not null default clock_timestamp(),
 unique(id,realm)
);
create table portal_identity_private.identities (
 realm text not null references portal_identity_private.realms(realm),
 subject text not null check(length(subject) between 1 and 256 and subject !~ '[[:cntrl:][:space:]]'),
 principal_id uuid not null,
 revoked boolean not null default false,
 primary key(realm,subject),
 unique(principal_id),
 foreign key(principal_id,realm) references portal_identity_private.principals(id,realm)
);
create table portal_identity_private.revoked_sessions (
 realm text not null,
 subject text not null,
 session_id text not null check(length(session_id) between 1 and 256 and session_id !~ '[[:cntrl:][:space:]]'),
 revoked_at timestamptz not null default clock_timestamp(),
 primary key(realm,subject,session_id),
 foreign key(realm,subject) references portal_identity_private.identities(realm,subject)
);
create table portal_identity_private.mapping_audit (
 id bigint generated always as identity primary key,
 principal_id uuid not null references portal_identity_private.principals(id),
 action text not null,
 review_reference text not null check(length(review_reference) between 1 and 160),
 occurred_at timestamptz not null default clock_timestamp()
);
create function portal_identity_private.guard_realm() returns trigger
language plpgsql set search_path='' as $$begin
 if (old.realm,old.issuer,old.audience) is distinct from (new.realm,new.issuer,new.audience)
   and exists(select 1 from portal_identity_private.identities where realm=old.realm) then
  raise exception using errcode='42501',message='Bound realm cannot be reassigned';
 end if;
 return new;
end$$;
create trigger portal_realm_immutable before update on portal_identity_private.realms
 for each row execute function portal_identity_private.guard_realm();

-- Offline/operator migration primitive only, not an API. Retaining a legacy ID
-- requires an exact same-realm identity. No email lookup or automatic linking.
create function portal_identity_private.bind_identity(
 p_realm text,p_subject text,p_principal uuid,p_reference text
) returns uuid language plpgsql security definer set search_path='' as $$
declare legacy auth.users%rowtype; prior portal_identity_private.identities%rowtype;
begin
 if p_realm is null or p_realm not in ('employee','business') or p_subject is null
   or length(p_subject) not between 1 and 256 or p_subject ~ '[[:cntrl:][:space:]]'
   or p_principal is null or p_reference is null or length(btrim(p_reference)) not between 1 and 160 then
  raise exception using errcode='22023',message='Invalid explicit identity mapping'; end if;
 perform 1 from portal_identity_private.realms where realm=p_realm for update;
 if not found then raise exception using errcode='42501',message='Unconfigured realm'; end if;
 select * into prior from portal_identity_private.identities where realm=p_realm and subject=p_subject;
 if found then
  if prior.principal_id=p_principal and not prior.revoked then return p_principal; end if;
  raise exception using errcode='42501',message='Identity already bound or revoked';
 end if;
 select * into legacy from auth.users where id=p_principal;
 if exists(select 1 from public.profiles where id=p_principal)
   or (legacy.id is not null and (legacy.role is distinct from 'doji_'||p_realm
     or legacy.raw_app_meta_data->>'account_type' is distinct from p_realm
     or legacy.deleted_at is not null or legacy.banned_until>clock_timestamp()))
   or (p_realm='business' and exists(select 1 from public.admin_employees where id=p_principal))
   or (p_realm='employee' and exists(select 1 from business_private.accounts where id=p_principal)) then
  raise exception using errcode='42501',message='Member or wrong realm identity cannot be mapped'; end if;
 insert into portal_identity_private.principals(id,realm) values(p_principal,p_realm);
 insert into portal_identity_private.identities(realm,subject,principal_id) values(p_realm,p_subject,p_principal);
 insert into portal_identity_private.mapping_audit(principal_id,action,review_reference)
 values(p_principal,'identity.bound',btrim(p_reference));
 return p_principal;
end$$;

-- Private operator preparation commands. They share row locks with resolution;
-- no browser, existing service role or resolver receives EXECUTE on them.
create function portal_identity_private.set_principal_state(
 p_id uuid,p_expected bigint,p_state text,p_reference text
) returns bigint language plpgsql security definer set search_path='' as $$
declare prior portal_identity_private.principals%rowtype;
begin
 if p_state is null or p_state not in ('active','disabled','deleted')
   or p_reference is null or length(btrim(p_reference)) not between 1 and 160 then
  raise exception using errcode='22023',message='Invalid state change'; end if;
 select * into prior from portal_identity_private.principals where id=p_id for update;
 if not found or prior.state='deleted' or p_expected is distinct from prior.revision then
  raise exception using errcode='PT409',message='Principal revision changed or unavailable'; end if;
 update portal_identity_private.principals set state=p_state,revision=revision+1 where id=p_id;
 insert into portal_identity_private.mapping_audit(principal_id,action,review_reference)
 values(p_id,'principal.'||p_state,btrim(p_reference));
 return prior.revision+1;
end$$;
create function portal_identity_private.revoke_session(
 p_realm text,p_subject text,p_session text,p_reference text
) returns void language plpgsql security definer set search_path='' as $$
declare actor uuid;
begin
 if p_session is null or length(p_session) not between 1 and 256 or p_session ~ '[[:cntrl:][:space:]]'
   or p_reference is null or length(btrim(p_reference)) not between 1 and 160 then
  raise exception using errcode='22023',message='Invalid session revocation'; end if;
 select principal_id into actor from portal_identity_private.identities where realm=p_realm and subject=p_subject for update;
 if not found then raise exception using errcode='42501',message='Unknown identity'; end if;
 insert into portal_identity_private.revoked_sessions(realm,subject,session_id)
 values(p_realm,p_subject,p_session) on conflict do nothing;
 if found then
  insert into portal_identity_private.mapping_audit(principal_id,action,review_reference)
  values(actor,'session.revoked',btrim(p_reference));
 end if;
end$$;

-- Only the dedicated trusted verifier may supply these arguments, never a browser.
-- Identity resolution is NOT permission to execute an existing application command.
-- A future allowlisted bridge must resolve and execute in the SAME transaction.
create function portal_identity_private.resolve_identity(
 p_realm text,p_issuer text,p_audience text,p_subject text,p_session text,p_mfa boolean
) returns table(principal_id uuid,principal_revision bigint)
language plpgsql security definer set search_path='' as $$
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception using errcode='42501',message='Portal resolution requires read committed isolation'; end if;
 if p_realm is null or p_realm not in ('employee','business')
   or p_session is null or length(p_session) not between 1 and 256
   or p_session ~ '[[:cntrl:][:space:]]' or p_mfa is null
   or (p_realm='employee' and p_mfa is distinct from true) then
  raise exception using errcode='42501',message='Portal identity denied'; end if;
 -- Lock first, then re-read in a fresh READ COMMITTED statement. Checking the
 -- revocation subquery before waiting on a lock could otherwise use an old
 -- snapshot when a concurrent revoke_session transaction has just committed.
 perform 1
 from portal_identity_private.realms r
 join portal_identity_private.identities i on i.realm=r.realm
 join portal_identity_private.principals p on p.id=i.principal_id and p.realm=i.realm
 where r.realm=p_realm and i.subject=p_subject
 for share of r,i,p;
 if not found then raise exception using errcode='42501',message='Portal identity denied'; end if;
 return query select p.id,p.revision
 from portal_identity_private.realms r
 join portal_identity_private.identities i on i.realm=r.realm
 join portal_identity_private.principals p on p.id=i.principal_id and p.realm=i.realm
 where r.realm=p_realm and r.enabled and r.issuer=p_issuer and r.audience=p_audience
   and i.subject=p_subject and not i.revoked and p.state='active'
   and not exists(select 1 from portal_identity_private.revoked_sessions s
     where s.realm=i.realm and s.subject=i.subject and s.session_id=p_session);
 if not found then raise exception using errcode='42501',message='Portal identity denied'; end if;
end$$;
-- Fixed new tables only; existing defaults/grants/policies remain unchanged.
do $$declare t text; begin
 foreach t in array array['realms','principals','identities','revoked_sessions','mapping_audit'] loop
  execute format('alter table portal_identity_private.%I enable row level security',t);
  execute format('revoke all on portal_identity_private.%I from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver',t);
 end loop;
end$$;
revoke all on all sequences in schema portal_identity_private from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;
revoke all on all functions in schema portal_identity_private from public,anon,authenticated,doji_employee,doji_business,service_role,doji_identity_resolver;
grant usage on schema portal_identity_private to doji_identity_resolver;
grant execute on function portal_identity_private.resolve_identity(text,text,text,text,text,boolean) to doji_identity_resolver;
-- NOINHERIT does not remove PUBLIC privileges. Fail instead of rewriting any
-- existing member grants. Only reviewed pure calculators and non-callable
-- invoker trigger functions may remain effective in the public app schema.
do $$begin
 if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.prokind='f'
    and not exists(select 1 from pg_depend d where d.classid='pg_proc'::regclass and d.objid=p.oid and d.deptype='e')
    and has_function_privilege('doji_identity_resolver',p.oid,'execute')
    and not (not p.prosecdef and p.prorettype='trigger'::regtype)
    and not exists(select 1 from (values
      ('level_from_xp(integer)','38926c89498cd4a777f07c619f76839f'),
      ('shields_for_level(integer)','471825f64f24c04e36bf7d99387b4920'),
      ('sparks_for_badge_tier(text)','2d9e9736db15346df8b18513ff2d1147'),
      ('sparks_for_level(integer)','05c86e4d237bfefe02e645a52e5e8fc7'),
      ('sparks_for_xp(integer)','1e41fe5ac4224300576b72b7f01f9f4a')
    ) reviewed(signature,source_hash) where p.oid=to_regprocedure('public.'||signature)
      and md5(p.prosrc)=source_hash and not p.prosecdef and p.provolatile='i'
      and p.prorettype='integer'::regtype
      and p.prolang in(select oid from pg_language where lanname in('sql','plpgsql')))) then
  raise exception 'Identity isolation preflight: unexpected application function access';
 end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname in('public','storage','auth','business_private','portal_identity_private')
    and c.relkind in('r','v','m','p','f')
    and has_table_privilege('doji_identity_resolver',c.oid,'select,insert,update,delete,truncate,references,trigger')) then
  raise exception 'Identity isolation preflight: unexpected table access';
 end if;
end$$;
-- No LOGIN, authenticator grant or credential. Draft alone is unreachable.
commit;
