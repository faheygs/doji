-- LOCAL INTEGRATION CANDIDATE ONLY. Requires moderation_media_ledger_v1.sql.
-- Cleanup fencing, automatic-report quarantine and hosted qualification remain
-- release gates. No historical backfill, bucket changes, wakeup or deployment.
begin;
set local lock_timeout='2s';
set local statement_timeout='15s';

create table public.moderation_media_integration_rollback (
 signature text primary key, original_definition text not null, installed_hash text not null
);
alter table public.moderation_media_integration_rollback enable row level security;
revoke all on public.moderation_media_integration_rollback from public,anon,authenticated,doji_employee,service_role;

create function public.moderation_media_has_active_hold_v1(p_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.moderation_media_decisions link
 join public.moderation_decisions d on d.id=link.decision_id
 where link.object_id=p_id and d.state='active' and d.action in('remove_content','remove_profile_photo','quarantine'));
$$;

create function public.capture_decision_media_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare slot record; original_avatar text;
begin
 if new.state<>'active' or new.action not in('remove_content','remove_profile_photo','quarantine') then return new; end if;
 -- Legacy account-command internals briefly use profile_photo, then correct the
 -- decision to account. The actual report target, not that intermediate row, wins.
 if not exists(select 1 from public.reports r where r.id=new.report_id and r.target_kind=new.content_kind) then return new; end if;
 if new.content_kind='profile_photo' then
  original_avatar:=new.original_payload->>'avatar_url';
  if original_avatar is not null then perform public.capture_moderation_media_v1(new.id,'avatars','profile_photo',original_avatar); end if;
 elsif new.content_kind='post' then
  for slot in select v.kind,v.url from public.posts p
   cross join lateral(values('photo',p.photo_url),('front_photo',p.front_photo_url),('video',p.video_url)) v(kind,url)
   where p.id=new.content_id and v.url is not null order by v.url,v.kind loop
   perform public.capture_moderation_media_v1(new.id,'post-media',slot.kind,slot.url);
  end loop;
 end if;
 return new;
end$$;
create trigger capture_decision_media after insert on public.moderation_decisions
 for each row execute function public.capture_decision_media_v1();

create function public.guard_media_decision_transition_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if old.state is not distinct from new.state then return new; end if;
 for item in select m.* from public.moderation_media_objects m
  where exists(select 1 from public.moderation_media_decisions l where l.object_id=m.id and l.decision_id=old.id)
  order by m.id for update of m nowait loop
  -- A Storage request already in flight may outlive lease expiry. Its 20-second
  -- deadline fits within this additional minute; do not reverse through that gap.
  if item.lease_until>clock_timestamp()-interval '1 minute' then
   raise exception 'Media operation in progress; retry this review' using errcode='55P03';
  end if;
 end loop;
 return new;
end$$;
create trigger guard_media_decision_transition before update of state on public.moderation_decisions
 for each row execute function public.guard_media_decision_transition_v1();

create function public.reconcile_media_decision_transition_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare item record;
begin
 if old.state is not distinct from new.state then return new; end if;
 for item in select m.* from public.moderation_media_objects m
  where exists(select 1 from public.moderation_media_decisions l where l.object_id=m.id and l.decision_id=new.id)
  order by m.id for update of m nowait loop
  if not public.moderation_media_has_active_hold_v1(item.id) and item.desired<>'restored'
   and exists(select 1 from public.profiles p where p.id=new.affected_user_id) then
   update public.moderation_media_objects set desired='restored',revision=revision+1,
    attempts=0,lease_id=null,lease_until=null,next_attempt_at=clock_timestamp(),failure_code=null,
    phase=case when phase='needs_attention' then case when archive_proof is null then 'pending' else 'archived' end else phase end
   where id=item.id;
  end if;
 end loop;
 return new;
end$$;
create trigger reconcile_media_decision_transition after update of state on public.moderation_decisions
 for each row execute function public.reconcile_media_decision_transition_v1();

-- Deleting an account never republishes a queued appeal restoration. Keep an
-- in-flight lease until it finishes/expires; a subsequent cancellation job checks
-- for a copy that might already have reached Storage before deleting it safely.
create function public.cancel_media_restore_on_member_delete_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.moderation_media_objects m set restore_cancelled=true,
  phase=case when phase='restored' then case when archive_proof is null then 'pending' else 'archived' end else phase end
 where m.desired='restored' and exists(
  select 1 from public.moderation_media_decisions l join public.moderation_decisions d on d.id=l.decision_id
  where l.object_id=m.id and d.affected_user_id=old.id);
 return old;
end$$;
create trigger cancel_media_restore_on_member_delete before delete on public.profiles
 for each row execute function public.cancel_media_restore_on_member_delete_v1();

create function public.finish_cancelled_media_restore_v1(p_id uuid,p_lease uuid,p_revision bigint,p_identity jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.moderation_media_objects%rowtype; actual jsonb;
begin
 select * into item from public.moderation_media_objects where id=p_id for update;
 if not found or not item.restore_cancelled or item.desired<>'restored'
  or item.lease_id is distinct from p_lease or item.revision<>p_revision or item.lease_until<=clock_timestamp() then return false; end if;
 select jsonb_build_object('id',o.id,'version',o.version,'size',(o.metadata->>'size')::bigint,'mime',o.metadata->>'mimetype')
 into actual from storage.objects o where o.bucket_id=item.bucket and o.name=item.object_path;
 if actual is distinct from p_identity then raise exception 'Cancelled restoration identity changed'; end if;
 if actual is not null and (actual->'size' is distinct from item.original->'size' or actual->'mime' is distinct from item.original->'mime'
  or (item.archive_proof is null and actual is distinct from item.original)) then raise exception 'Cancelled restoration identity mismatch'; end if;
 -- Worker verified present bytes against the immutable archive digest. No copy
 -- is made by cancellation. Preserve evidence and queue exact removal/recheck.
 update public.moderation_media_objects set desired='restricted',restore_cancelled=false,revision=revision+1,
  original=coalesce(actual,original),access_probe=case when actual is not null then null else access_probe end,
  phase=case when actual is not null then case when archive_proof is null then 'pending' else 'archived' end
   when archive_proof is not null and access_probe is not null then 'origin_removed' else 'needs_attention' end,
  origin_removed_at=case when actual is null then clock_timestamp() else null end,revoked_at=null,
  failure_code=case when actual is null and (archive_proof is null or access_probe is null) then 'source_missing_before_archive' else null end,
  lease_id=null,lease_until=null,attempts=0,next_attempt_at=clock_timestamp()+interval '90 seconds' where id=p_id;
 return true;
end$$;

create function public.verified_restored_avatar_owned_v1(p_user uuid,p_path text)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.moderation_media_objects m
 join storage.objects o on o.bucket_id=m.bucket and o.name=m.object_path
 where m.bucket='avatars' and m.object_path=p_path and m.phase='restored' and m.desired='restored'
 and m.restored_identity=jsonb_build_object('id',o.id,'version',o.version,'size',(o.metadata->>'size')::bigint,'mime',o.metadata->>'mimetype')
 and exists(select 1 from public.moderation_media_decisions l join public.moderation_decisions d on d.id=l.decision_id
  where l.object_id=m.id and d.affected_user_id=p_user and d.content_kind='profile_photo')
 and not public.moderation_media_has_active_hold_v1(m.id));
$$;

-- Preserve the ordinary avatar ownership checks. The only ownership exception is
-- an exact, byte-verified restored identity tied to this same affected member.
do $patch$ declare old_definition text; new_definition text; old_check text; new_check text;
begin
 old_definition:=pg_get_functiondef('public.enforce_owned_profile_avatar()'::regprocedure);
 old_check:='and object.owner_id = new.id::text';
 if length(old_definition)-length(replace(old_definition,old_check,''))<>length(old_check) then raise exception 'Unexpected avatar ownership definition'; end if;
 if position('object_path := public.public_storage_object_path(new.avatar_url, ''avatars'');' in old_definition)=0 then raise exception 'Missing avatar path boundary'; end if;
 new_check:='and (object.owner_id = new.id::text or public.verified_restored_avatar_owned_v1(new.id, object_path))';
 new_definition:=replace(old_definition,old_check,new_check);
 if position(E'declare\n  object_path text;' in new_definition)=0 then raise exception 'Unexpected avatar variable declaration'; end if;
 new_definition:=replace(new_definition,E'declare\n  object_path text;',E'<<media_avatar_guard>>\ndeclare\n  object_path text;');
 new_definition:=replace(new_definition,'object_path := public.public_storage_object_path(new.avatar_url, ''avatars'');',$insert$
  object_path := public.public_storage_object_path(new.avatar_url, 'avatars');
  if exists(select 1 from public.moderation_media_objects m where m.bucket='avatars' and m.object_path=media_avatar_guard.object_path
    and (m.phase<>'restored' or m.desired<>'restored')) then
    if tg_op='UPDATE' and coalesce(auth.jwt()->>'aal','')='aal2'
      and public.admin_user_has_permission('moderation.write') then
      -- Existing appeal/no-violation commands still own the decision and audit.
      -- Linking this media is deferred until the fenced worker confirms its bytes.
      new.avatar_url:=old.avatar_url;
      return new;
    end if;
    raise exception 'Profile photo restoration is not complete';
  end if;
$insert$);
 execute new_definition;
 insert into public.moderation_media_integration_rollback values('public.enforce_owned_profile_avatar()',old_definition,md5(pg_get_functiondef('public.enforce_owned_profile_avatar()'::regprocedure)));
end $patch$;

create function public.guard_media_post_visibility_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.moderation_status='visible' and old.moderation_status is distinct from 'visible'
 and exists(select 1 from public.moderation_media_decisions l
  join public.moderation_decisions d on d.id=l.decision_id
  join public.moderation_media_objects m on m.id=l.object_id
  where d.content_kind='post' and d.content_id=new.id
   and (m.phase<>'restored' or m.desired<>'restored' or public.moderation_media_has_active_hold_v1(m.id))) then
  new.moderation_status:=old.moderation_status;
 end if;
 return new;
end$$;
create trigger guard_media_post_visibility before update of moderation_status on public.posts
 for each row execute function public.guard_media_post_visibility_v1();

create function public.guard_media_reversal_notice_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.kind='appeal_reversed' and exists(select 1 from public.moderation_media_decisions l
  join public.moderation_media_objects m on m.id=l.object_id where l.decision_id=new.decision_id and m.phase<>'restored') then
  new.body:='We reversed the original decision. Media restoration is pending verification; other active restrictions or a newer profile photo will be preserved. '
   ||coalesce((select a.review_reason from public.moderation_appeals a where a.decision_id=new.decision_id order by a.reviewed_at desc nulls last limit 1),'');
 end if;
 return new;
end$$;
create trigger guard_media_reversal_notice before insert on public.moderation_notices
 for each row execute function public.guard_media_reversal_notice_v1();

create function public.finish_moderation_media_restore_v1(p_id uuid,p_lease uuid,p_revision bigint,p_identity jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare item public.moderation_media_objects%rowtype; source storage.objects%rowtype; target record; actual jsonb;
begin
 select * into item from public.moderation_media_objects where id=p_id for update;
 if not found or item.desired<>'restored' or not public.check_moderation_media_lease_v1(p_id,p_lease,p_revision)
  or public.moderation_media_has_active_hold_v1(p_id) then return false; end if;
 select * into source from storage.objects where bucket_id=item.bucket and name=item.object_path;
 if not found then raise exception 'Restored object unavailable'; end if;
 actual:=jsonb_build_object('id',source.id,'version',source.version,'size',(source.metadata->>'size')::bigint,'mime',source.metadata->>'mimetype');
 if actual is distinct from p_identity or actual->'size' is distinct from item.original->'size'
  or actual->'mime' is distinct from item.original->'mime'
  or (item.archive_proof is null and actual is distinct from item.original) then raise exception 'Restored identity mismatch'; end if;
 -- Storage bytes were checked by the service worker before this RPC. The fresh
 -- identity, lease, revision and active holds fence the atomic reference update.
 update public.moderation_media_objects set restored_identity=actual,phase='restored',
  lease_id=null,lease_until=null,failure_code=null where id=p_id;
 for target in select distinct d.content_kind,d.content_id,d.affected_user_id,l.original_url
  from public.moderation_media_decisions l join public.moderation_decisions d on d.id=l.decision_id
  where l.object_id=p_id order by d.content_kind,d.content_id loop
  if target.affected_user_id is null or not exists(select 1 from public.profiles p where p.id=target.affected_user_id and not p.is_banned) then continue; end if;
  if exists(select 1 from public.moderation_decisions d where d.content_kind=target.content_kind and d.content_id=target.content_id
    and d.state='active' and d.action in('remove_content','remove_profile_photo','quarantine')) then continue; end if;
  if target.content_kind='profile_photo' then
   perform 1 from public.profiles where id=target.affected_user_id for update nowait;
   update public.profiles set avatar_url=target.original_url where id=target.affected_user_id and avatar_url is null;
  elsif target.content_kind='post' and not exists(select 1 from public.moderation_media_decisions l
   join public.moderation_decisions d on d.id=l.decision_id join public.moderation_media_objects m on m.id=l.object_id
   where d.content_kind='post' and d.content_id=target.content_id and (m.phase<>'restored' or m.desired<>'restored'))
   and not exists(select 1 from public.reports r where r.post_id=target.content_id and r.status='pending'
    and r.reason_detail in('credible_threat','human_exploitation','nonconsensual_intimate_images','sexual_exploitation','child_sexual_content')) then
   perform 1 from public.posts where id=target.content_id for update nowait;
   update public.posts set moderation_status='visible' where id=target.content_id and moderation_status in('removed','quarantined');
  end if;
 end loop;
 for target in select distinct d.id,d.affected_user_id from public.moderation_media_decisions l
  join public.moderation_decisions d on d.id=l.decision_id where l.object_id=p_id loop
  if not exists(select 1 from public.moderation_media_decisions l join public.moderation_media_objects m on m.id=l.object_id
   where l.decision_id=target.id and (m.phase<>'restored' or m.desired<>'restored')) then
   update public.moderation_notices set body='The original decision was reversed. Media restoration checks are complete; other active restrictions and newer uploads were preserved. '
    ||coalesce((select a.review_reason from public.moderation_appeals a where a.decision_id=target.id order by a.reviewed_at desc nulls last limit 1),'')
    where decision_id=target.id and kind='appeal_reversed';
  end if;
  if target.affected_user_id is not null then
   perform public.enqueue_domain_event('user:'||target.affected_user_id::text||':events','moderation.status.changed',target.id,
    jsonb_build_object('version',1,'decisionId',target.id),null);
  end if;
 end loop;
 return true;
end$$;

do $$declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p
 where p.pronamespace='public'::regnamespace and p.proname in('moderation_media_has_active_hold_v1',
  'capture_decision_media_v1','guard_media_decision_transition_v1','reconcile_media_decision_transition_v1',
  'verified_restored_avatar_owned_v1','guard_media_post_visibility_v1','guard_media_reversal_notice_v1','finish_moderation_media_restore_v1',
  'cancel_media_restore_on_member_delete_v1','finish_cancelled_media_restore_v1') loop
  execute format('revoke all on function %s from public,anon,authenticated,doji_employee,service_role',f.signature);
  if f.proname in('finish_moderation_media_restore_v1','finish_cancelled_media_restore_v1') then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end$$;
commit;
