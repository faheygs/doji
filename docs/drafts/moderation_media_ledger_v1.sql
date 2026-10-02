-- PREPARATION ONLY. Apply in one transaction after guarded production rehearsal.
-- No bucket creation, schedules, wakeups or historical removal/backfill here.
begin;
create table public.moderation_media_objects (
 id uuid primary key default gen_random_uuid(),
 bucket text not null check(bucket in ('avatars','post-media')),
 object_path text not null check(length(object_path) between 1 and 1024),
 original jsonb not null check(jsonb_typeof(original)='object'),
 archive_proof jsonb,
 access_probe jsonb,
 restricted_evidence boolean not null default false,
 phase text not null default 'pending' check(phase in('pending','archived','origin_removed','revoked','restored','needs_attention')),
 desired text not null default 'restricted' check(desired in('restricted','restored')),
 restore_cancelled boolean not null default false,
 revision bigint not null default 1,
 lease_id uuid,
 lease_until timestamptz,
 attempts integer not null default 0,
 next_attempt_at timestamptz not null default clock_timestamp(),
 origin_removed_at timestamptz,
 revoked_at timestamptz,
 restored_identity jsonb,
 failure_code text,
 created_at timestamptz not null default clock_timestamp(),
 unique(bucket,object_path),
 check((lease_id is null)=(lease_until is null))
);
create table public.moderation_media_decisions (
 object_id uuid not null references public.moderation_media_objects(id) on delete restrict,
 decision_id uuid not null references public.moderation_decisions(id) on delete restrict,
 slot text not null check(slot in('profile_photo','photo','front_photo','video')),
 original_url text not null,
 primary key(object_id,decision_id,slot)
);
create index moderation_media_decision_idx on public.moderation_media_decisions(decision_id);
-- A legacy/external reference must not prevent immediate logical hiding. Its
-- unresolved access/evidence gap prevents final removal closure instead.
create table public.moderation_media_gaps (
 decision_id uuid not null references public.moderation_decisions(id) on delete restrict,
 slot text not null check(slot in('profile_photo','photo','front_photo','video')),
 failure_code text not null check(failure_code in('noncanonical_reference','cleanup_reserved')),
 created_at timestamptz not null default clock_timestamp(),
 primary key(decision_id,slot)
);
alter table public.moderation_media_gaps enable row level security;
revoke all on public.moderation_media_gaps from public,anon,authenticated,doji_employee,service_role;
create index moderation_media_pending_idx on public.moderation_media_objects(next_attempt_at,id)
 where phase in('pending','archived','origin_removed') or (desired='restored' and phase='revoked');
create index moderation_media_lease_idx on public.moderation_media_objects(lease_until) where lease_until is not null;
alter table public.moderation_media_objects enable row level security;
alter table public.moderation_media_decisions enable row level security;
revoke all on public.moderation_media_objects,public.moderation_media_decisions from public,anon,authenticated,doji_employee,service_role;

-- Cleanup and moderation serialize on the same exact bucket/path advisory key.
-- Tombstones keep an old cleanup retry from deleting a replacement at that path.
create table public.media_cleanup_reservations (
 bucket text not null check(bucket in('avatars','post-media')),
 object_path text not null check(length(object_path) between 1 and 1024),
 original jsonb,
 lease_id uuid not null,
 lease_until timestamptz not null,
 completed_at timestamptz,
 created_at timestamptz not null default clock_timestamp(),
 primary key(bucket,object_path)
);
alter table public.media_cleanup_reservations enable row level security;
revoke all on public.media_cleanup_reservations from public,anon,authenticated,doji_employee,service_role;

-- Internal capture only; normal clients and the service API cannot invent holds.
-- Caller must already hold the exact moderated row/decision lock.
create function public.capture_moderation_media_v1(p_decision uuid,p_bucket text,p_slot text,p_url text)
returns uuid language plpgsql security definer set search_path='' as $$
declare path text; source storage.objects%rowtype; item public.moderation_media_objects%rowtype;
 decision public.moderation_decisions%rowtype; identity jsonb; expected_url text;
begin
 select * into strict decision from public.moderation_decisions where id=p_decision;
 if decision.state<>'active' or decision.action not in('remove_content','remove_profile_photo','quarantine') then
  raise exception 'Active removal decision required'; end if;
 if (p_bucket='avatars' and (decision.content_kind<>'profile_photo' or p_slot<>'profile_photo'))
  or (p_bucket='post-media' and (decision.content_kind<>'post' or p_slot not in('photo','front_photo','video')))
  or p_bucket not in('avatars','post-media') then raise exception 'Media target mismatch'; end if;
 if p_bucket='avatars' then expected_url:=decision.original_payload->>'avatar_url';
 else
  select case p_slot when 'photo' then photo_url when 'front_photo' then front_photo_url when 'video' then video_url end
  into expected_url from public.posts where id=decision.content_id;
 end if;
 if p_url is null or p_url is distinct from expected_url then raise exception 'Media reference does not match decision'; end if;
 path:=public.public_storage_object_path(p_url,p_bucket);
 if path is null or length(path)>1024 or path !~ '^[a-zA-Z0-9_./-]+$' or path ~ '(^|/)(\.|\.\.)?(/|$)' then
  insert into public.moderation_media_gaps(decision_id,slot,failure_code) values(p_decision,p_slot,'noncanonical_reference') on conflict do nothing;
  return null; end if;
 if not pg_try_advisory_xact_lock(hashtextextended('moderation-media:'||p_bucket||':'||path,0)) then
  raise exception 'Media operation in progress; retry this decision' using errcode='55P03'; end if;
 if exists(select 1 from public.media_cleanup_reservations where bucket=p_bucket and object_path=path) then
  insert into public.moderation_media_gaps(decision_id,slot,failure_code) values(p_decision,p_slot,'cleanup_reserved') on conflict do nothing;
  return null; end if;
 select * into item from public.moderation_media_objects where bucket=p_bucket and object_path=path for update nowait;
 if found then
  if item.lease_until>clock_timestamp()-interval '1 minute' then raise exception 'Media operation in progress; retry this decision' using errcode='55P03'; end if;
  if item.phase='restored' then
   select * into source from storage.objects where bucket_id=p_bucket and name=path for update nowait;
   identity:=jsonb_build_object('id',source.id,'version',source.version,'size',(source.metadata->>'size')::bigint,'mime',source.metadata->>'mimetype');
   if not found or identity is distinct from item.restored_identity then raise exception 'Restored source identity changed'; end if;
   update public.moderation_media_objects set original=identity,desired='restricted',
    phase=case when archive_proof is null then 'pending' else 'archived' end,
    revision=revision+1,attempts=0,next_attempt_at=clock_timestamp(),origin_removed_at=null,revoked_at=null,
    lease_id=null,lease_until=null,failure_code=null,access_probe=null where id=item.id returning * into item;
  elsif item.desired='restored' then
   -- Superseding quarantine with a final removal in the same transaction cancels
   -- the pending reversal. Never recopy or republish merely because it was queued.
   update public.moderation_media_objects set desired='restricted',revision=revision+1,
    attempts=0,lease_id=null,lease_until=null,failure_code=null where id=item.id returning * into item;
  end if;
 else
  select * into source from storage.objects where bucket_id=p_bucket and name=path for update nowait;
  if not found or source.version is null or source.metadata->>'mimetype' is null
   or coalesce(source.metadata->>'size','') !~ '^[1-9][0-9]{0,11}$' then
   insert into public.moderation_media_objects(bucket,object_path,original,phase,failure_code)
    values(p_bucket,path,'{}','needs_attention','invalid_storage_metadata') returning * into item;
  else
   identity:=jsonb_build_object('id',source.id,'version',source.version,'size',(source.metadata->>'size')::bigint,'mime',source.metadata->>'mimetype');
   insert into public.moderation_media_objects(bucket,object_path,original,phase,failure_code)
    values(p_bucket,path,identity,
     case when (source.metadata->>'size')::bigint > (case when p_bucket='avatars' then 5242880 else 104857600 end) then 'needs_attention' else 'pending' end,
     case when (source.metadata->>'size')::bigint > (case when p_bucket='avatars' then 5242880 else 104857600 end) then 'object_too_large' end)
    returning * into item;
  end if;
 end if;
 insert into public.moderation_media_decisions(object_id,decision_id,slot,original_url)
 values(item.id,p_decision,p_slot,p_url) on conflict do nothing;
 return item.id;
end$$;

create function public.moderation_media_is_frozen_v1(p_bucket text,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.moderation_media_objects where bucket=p_bucket and object_path=p_path)
 or exists(select 1 from public.media_cleanup_reservations where bucket=p_bucket and object_path=p_path);
$$;
revoke all on function public.moderation_media_is_frozen_v1(text,text) from public,anon,authenticated,doji_employee,service_role;
grant execute on function public.moderation_media_is_frozen_v1(text,text) to anon,authenticated;
-- Preserve existing allow policies; these restrictions affect only exact held paths.
-- Service maintenance exclusion and appeal integration are separate release gates.
create policy moderation_media_frozen_insert on storage.objects as restrictive for insert to anon,authenticated
 with check(not public.moderation_media_is_frozen_v1(bucket_id,name));
create policy moderation_media_frozen_update on storage.objects as restrictive for update to anon,authenticated
 using(not public.moderation_media_is_frozen_v1(bucket_id,name))
 with check(not public.moderation_media_is_frozen_v1(bucket_id,name));
create policy moderation_media_frozen_delete on storage.objects as restrictive for delete to anon,authenticated
 using(not public.moderation_media_is_frozen_v1(bucket_id,name));

create function public.claim_moderation_media_v1()
returns jsonb language plpgsql security definer set search_path='' as $$
declare item public.moderation_media_objects%rowtype;
begin
 -- One bounded object per invocation. Expired work remains durable; no tight loop.
 if not pg_try_advisory_xact_lock(hashtextextended('moderation-media:claim-capacity',0)) then return null; end if;
 if (select count(*) from public.moderation_media_objects where lease_until>clock_timestamp()-interval '1 minute')>=2 then return null; end if;
 update public.moderation_media_objects set phase='needs_attention',failure_code=coalesce(failure_code,'unknown'),lease_id=null,lease_until=null
 where attempts>=24 and (phase in('pending','archived','origin_removed') or (desired='restored' and phase<>'restored'))
  and phase<>'needs_attention' and (lease_until is null or lease_until<clock_timestamp()-interval '1 minute');
 select * into item from public.moderation_media_objects
 where ((desired='restricted' and phase in('pending','archived','origin_removed')) or (desired='restored' and phase in('pending','archived','origin_removed','revoked')))
  and next_attempt_at<=clock_timestamp() and (lease_until is null or lease_until<clock_timestamp()-interval '1 minute')
  and attempts<24 order by next_attempt_at,id for update skip locked limit 1;
 if not found then return null; end if;
 update public.moderation_media_objects set lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes',attempts=attempts+1
 where id=item.id returning * into item;
 return jsonb_build_object('id',item.id,'lease_id',item.lease_id,'revision',item.revision,'operation',case when item.desired='restored' and item.restore_cancelled then 'cancel_restore' when item.desired='restored' then 'restore' when item.phase='origin_removed' then 'verify' else 'remove' end,
  'source',jsonb_build_object('bucket',item.bucket,'path',item.object_path),
  'evidence',jsonb_build_object('bucket','moderation-evidence','path',item.id::text||'/original'),
  'original',item.original,'archived',item.archive_proof,'access_probe',item.access_probe);
end$$;

create function public.check_moderation_media_lease_v1(p_id uuid,p_lease uuid,p_revision bigint)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.moderation_media_objects where id=p_id and lease_id=p_lease
  and revision=p_revision and lease_until>clock_timestamp() and not restore_cancelled
  and ((desired='restricted' and phase in('pending','archived','origin_removed')) or (desired='restored' and phase in('pending','archived','origin_removed','revoked'))));
$$;

create function public.save_moderation_media_archive_v1(p_id uuid,p_lease uuid,p_revision bigint,p_proof jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.moderation_media_objects%rowtype;
begin
 select * into item from public.moderation_media_objects where id=p_id for update;
 if item.desired<>'restricted' or not public.check_moderation_media_lease_v1(p_id,p_lease,p_revision) then return false; end if;
 if jsonb_typeof(p_proof) is distinct from 'object' or p_proof->>'sha256' !~ '^[a-f0-9]{64}$'
  or p_proof->>'sha256' is null or p_proof->'size' is distinct from item.original->'size'
  or jsonb_typeof(p_proof->'evidenceIdentity') is distinct from 'object'
  or p_proof#>>'{evidenceIdentity,id}' is null or p_proof#>>'{evidenceIdentity,version}' is null
  or p_proof#>'{evidenceIdentity,size}' is distinct from item.original->'size'
  or p_proof#>'{evidenceIdentity,mime}' is distinct from item.original->'mime' then
  raise exception 'Invalid archive proof'; end if;
 if item.archive_proof is not null and item.archive_proof<>p_proof then raise exception 'Archive proof is immutable'; end if;
 update public.moderation_media_objects set archive_proof=p_proof,phase='archived' where id=p_id;
 return true;
end$$;

create function public.finish_moderation_media_origin_v1(p_id uuid,p_lease uuid,p_revision bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.moderation_media_objects%rowtype;
begin
 select * into item from public.moderation_media_objects where id=p_id for update;
 if item.desired<>'restricted' or not public.check_moderation_media_lease_v1(p_id,p_lease,p_revision) then return false; end if;
 if item.archive_proof is null then raise exception 'Verified archive required'; end if;
 if exists(select 1 from storage.objects where bucket_id=item.bucket and name=item.object_path) then
  raise exception 'Source object still present'; end if;
 if item.access_probe is null then raise exception 'Pre-deletion access probe required'; end if;
 update public.moderation_media_objects set phase='origin_removed',origin_removed_at=clock_timestamp(),
  next_attempt_at=clock_timestamp()+interval '90 seconds',lease_id=null,lease_until=null where id=p_id;
 -- The coordinator now owns cleanup of this exact held path. Acknowledge its old
 -- generic queue entries only after absence has been checked, never on capture.
 delete from public.media_objects_pending_delete where bucket_id=item.bucket and object_path=item.object_path;
 delete from public.media_upload_intents where bucket_id=item.bucket and object_path=item.object_path and committed_at is null;
 -- Deliberately NOT revoked: hosted CDN/old URL verification must finish separately.
 return true;
end$$;

create function public.save_moderation_media_probe_v1(p_id uuid,p_lease uuid,p_revision bigint,p_probe jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.moderation_media_objects%rowtype; prefix text; expiry timestamptz;
begin
 select * into item from public.moderation_media_objects where id=p_id for update;
 if not found or item.desired<>'restricted' or item.phase not in('pending','archived')
  or not public.check_moderation_media_lease_v1(p_id,p_lease,p_revision) then return false; end if;
 prefix:='/object/sign/'||item.bucket||'/'||item.object_path||'?token=';
 expiry:=(p_probe->>'expiresAt')::timestamptz;
 if jsonb_typeof(p_probe) is distinct from 'object' or p_probe->>'signedPath' is null
  or left(p_probe->>'signedPath',length(prefix))<>prefix
  or substring(p_probe->>'signedPath',length(prefix)+1) !~ '^[A-Za-z0-9_.-]+$'
  or length(p_probe->>'signedPath')>8192 or expiry is null
  or expiry<clock_timestamp()+interval '5 minutes' or expiry>clock_timestamp()+interval '25 hours' then
  raise exception 'Invalid access probe'; end if;
 if item.access_probe is not null and item.access_probe<>p_probe then raise exception 'Access probe is immutable'; end if;
 update public.moderation_media_objects set access_probe=p_probe where id=p_id;
 return true;
end$$;

create function public.finish_moderation_media_revocation_v1(p_id uuid,p_lease uuid,p_revision bigint)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.moderation_media_objects%rowtype;
begin
 select * into item from public.moderation_media_objects where id=p_id for update;
 if not found or item.desired<>'restricted' or item.phase<>'origin_removed'
  or not public.check_moderation_media_lease_v1(p_id,p_lease,p_revision) then return false; end if;
 if item.archive_proof is null or item.access_probe is null
  or item.origin_removed_at>clock_timestamp()-interval '90 seconds'
  or (item.access_probe->>'expiresAt')::timestamptz<=clock_timestamp()+interval '1 minute'
  or exists(select 1 from storage.objects where bucket_id=item.bucket and name=item.object_path) then
  raise exception 'Access revocation is not verified'; end if;
 -- Service has just checked the identical signed URL and public avatar URL.
 -- This is observed origin/CDN denial, not recall of browser/downloaded copies.
 update public.moderation_media_objects set phase='revoked',revoked_at=clock_timestamp(),
  lease_id=null,lease_until=null,failure_code=null where id=p_id;
 return true;
end$$;

create function public.fail_moderation_media_v1(p_id uuid,p_lease uuid,p_revision bigint,p_code text,p_terminal boolean)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if p_code not in('storage_unavailable','storage_request_failed','storage_inspection_failed','storage_read_interrupted',
  'source_changed','source_missing_before_archive','archive_metadata_mismatch','archive_bytes_mismatch','archive_changed',
  'source_still_present','invalid_storage_metadata','invalid_job','invalid_archive_proof','object_too_large','evidence_bucket_not_private',
  'invalid_restore','restore_conflict','invalid_access_probe','access_probe_expired','access_probe_unavailable','access_not_revoked','unknown') then
  raise exception 'Invalid failure code'; end if;
 update public.moderation_media_objects set lease_id=null,lease_until=null,failure_code=p_code,
  phase=case when p_terminal or attempts>=24 then 'needs_attention' else phase end,
  next_attempt_at=clock_timestamp()+interval '5 minutes'
 where id=p_id and lease_id=p_lease and revision=p_revision;
 return found;
end$$;

-- Explicit grants even when the project's default privileges are permissive.
do $$declare f record; begin
 for f in select p.oid::regprocedure as signature,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in('capture_moderation_media_v1','claim_moderation_media_v1',
 'check_moderation_media_lease_v1','save_moderation_media_archive_v1','finish_moderation_media_origin_v1','fail_moderation_media_v1',
 'save_moderation_media_probe_v1','finish_moderation_media_revocation_v1') loop
 execute format('revoke all on function %s from public,anon,authenticated,doji_employee,service_role',f.signature);
 if f.proname<>'capture_moderation_media_v1' then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end$$;
commit;
