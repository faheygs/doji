-- LOCAL CANDIDATE. Requires media ledger. Both service cleanup callers must use
-- the fenced helper before decision capture can be activated. Not deployed.
begin;
create function public.guard_cleanup_media_reference_v1()
returns trigger language plpgsql security definer set search_path='' as $$
declare asset record; path text; v_bucket text;
begin
 if tg_table_name='profiles' then
  if new.avatar_url is null or (tg_op='UPDATE' and new.avatar_url is not distinct from old.avatar_url) then return new; end if;
  v_bucket:='avatars';
 else
  if tg_op='UPDATE' and new.photo_url is not distinct from old.photo_url
   and new.front_photo_url is not distinct from old.front_photo_url and new.video_url is not distinct from old.video_url then return new; end if;
  v_bucket:='post-media';
 end if;
 for asset in select value from jsonb_array_elements_text(case when tg_table_name='profiles'
  then jsonb_build_array(to_jsonb(new)->>'avatar_url')
  else jsonb_build_array(to_jsonb(new)->>'photo_url',to_jsonb(new)->>'front_photo_url',to_jsonb(new)->>'video_url') end) order by value loop
  if asset.value is null then continue; end if;
  path:=public.public_storage_object_path(asset.value,v_bucket);
  if path is null then continue; end if; -- Existing ownership guard rejects it.
  if not pg_try_advisory_xact_lock(hashtextextended('moderation-media:'||v_bucket||':'||path,0)) then
   raise exception 'Media operation in progress; retry this submission' using errcode='55P03'; end if;
  if exists(select 1 from public.media_cleanup_reservations r where r.bucket=v_bucket and r.object_path=path) then
   raise exception 'Media upload expired; choose a new upload' using errcode='22023'; end if;
 end loop;
 return new;
end$$;
create trigger guard_cleanup_media_reference before insert or update of avatar_url on public.profiles
 for each row execute function public.guard_cleanup_media_reference_v1();
create trigger guard_cleanup_media_reference before insert or update of photo_url,front_photo_url,video_url on public.posts
 for each row execute function public.guard_cleanup_media_reference_v1();

create function public.claim_media_cleanup_v1(p_bucket text,p_paths text[])
returns jsonb language plpgsql security definer set search_path='' as $$
declare path text; reservation public.media_cleanup_reservations%rowtype;
 source storage.objects%rowtype; identity jsonb; result jsonb:='[]'; eligible boolean; path_owner uuid;
begin
 if p_bucket not in('avatars','post-media') or p_bucket is null or cardinality(p_paths) not between 1 and 100 or p_paths is null then raise exception 'Invalid cleanup batch'; end if;
 for path in select distinct x from unnest(p_paths) x order by x loop
  if path is null or length(path) not between 1 and 1024 or path !~ '^[a-zA-Z0-9_./-]+$' or path ~ '(^|/)(\.|\.\.)?(/|$)' then raise exception 'Invalid cleanup path'; end if;
  path_owner:=case when split_part(path,'/',1) ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
   then split_part(path,'/',1)::uuid else null end;
  if not pg_try_advisory_xact_lock(hashtextextended('moderation-media:'||p_bucket||':'||path,0)) then continue; end if;
  -- Never let maintenance delete a held source or its private archive. The media
  -- coordinator alone owns held-source removal, even after account deletion.
  if exists(select 1 from public.moderation_media_objects m where m.bucket=p_bucket and m.object_path=path) then continue; end if;
  select * into reservation from public.media_cleanup_reservations r where r.bucket=p_bucket and r.object_path=path for update nowait;
  if found then
   if reservation.completed_at is not null then
    if not exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=path) then
     result:=result||jsonb_build_array(jsonb_build_object('path',path,'state','complete'));
    end if;
    continue;
   end if;
   if reservation.lease_until>clock_timestamp()-interval '1 minute' then continue; end if;
  else
   select exists(select 1 from public.media_objects_pending_delete p where p.bucket_id=p_bucket and p.object_path=path)
    or exists(select 1 from public.media_upload_intents i where i.bucket_id=p_bucket and i.object_path=path
     and i.committed_at is null and i.created_at<clock_timestamp()-interval '24 hours')
    or exists(select 1 from public.account_deletion_cleanup c where c.user_id=path_owner
     and not exists(select 1 from auth.users u where u.id=c.user_id)) into eligible;
   if not eligible then continue; end if;
   -- A previously expired reservation can still be committed by a delayed app.
   -- Reference triggers use this same lock, so whichever commits first wins.
   if p_bucket='post-media' and exists(select 1 from public.posts p where
    (p.photo_url is not null and public.public_storage_object_path(p.photo_url,'post-media')=path) or
    (p.front_photo_url is not null and public.public_storage_object_path(p.front_photo_url,'post-media')=path) or
    (p.video_url is not null and public.public_storage_object_path(p.video_url,'post-media')=path)) then continue; end if;
   if p_bucket='avatars' and exists(select 1 from public.profiles p where p.id=path_owner
    and public.public_storage_object_path(p.avatar_url,'avatars')=path) then continue; end if;
   select * into source from storage.objects o where o.bucket_id=p_bucket and o.name=path for update nowait;
   identity:=null;
   if found then
    if source.version is null or source.metadata->>'mimetype' is null or coalesce(source.metadata->>'size','')!~'^[1-9][0-9]*$' then continue; end if;
    identity:=jsonb_build_object('id',source.id,'version',source.version,'size',(source.metadata->>'size')::bigint,'mime',source.metadata->>'mimetype');
   end if;
   insert into public.media_cleanup_reservations(bucket,object_path,original,lease_id,lease_until)
    values(p_bucket,path,identity,gen_random_uuid(),clock_timestamp()+interval '5 minutes') returning * into reservation;
  end if;
  update public.media_cleanup_reservations r set lease_id=gen_random_uuid(),lease_until=clock_timestamp()+interval '5 minutes'
   where r.bucket=p_bucket and r.object_path=path returning * into reservation;
  result:=result||jsonb_build_array(jsonb_build_object('path',path,'state','claimed','lease_id',reservation.lease_id,'original',reservation.original));
 end loop;
 return result;
end$$;

create function public.check_media_cleanup_lease_v1(p_bucket text,p_path text,p_lease uuid)
returns boolean language sql volatile security definer set search_path='' as $$
 select exists(select 1 from public.media_cleanup_reservations r where r.bucket=p_bucket and r.object_path=p_path
  and r.lease_id=p_lease and r.lease_until>clock_timestamp() and r.completed_at is null)
 and not exists(select 1 from public.moderation_media_objects m where m.bucket=p_bucket and m.object_path=p_path);
$$;

-- Dedicated bounded service readers avoid changing the legacy cleanup contracts.
-- Held items are owned by the media coordinator and cannot clog generic queues.
create function public.claim_media_cleanup_candidates_v1(p_kind text,p_limit integer default 20)
returns table(id uuid,bucket_id text,object_path text)
language plpgsql security definer set search_path='' as $$
begin
 if p_kind not in('expired','pending') or p_kind is null then raise exception 'Invalid cleanup queue'; end if;
 if p_kind='expired' then
  return query select i.id,i.bucket_id,i.object_path from public.media_upload_intents i
   where i.committed_at is null and i.created_at<clock_timestamp()-interval '24 hours'
   and not exists(select 1 from public.posts p where
    (p.photo_url is not null and public.public_storage_object_path(p.photo_url,'post-media')=i.object_path) or
    (p.front_photo_url is not null and public.public_storage_object_path(p.front_photo_url,'post-media')=i.object_path) or
    (p.video_url is not null and public.public_storage_object_path(p.video_url,'post-media')=i.object_path))
   and not exists(select 1 from public.moderation_media_objects m where m.bucket=i.bucket_id and m.object_path=i.object_path)
   and not exists(select 1 from public.media_cleanup_reservations r where r.bucket=i.bucket_id and r.object_path=i.object_path
    and r.completed_at is null and r.lease_until>clock_timestamp()-interval '1 minute')
   order by i.created_at,i.id for update of i skip locked limit least(greatest(coalesce(p_limit,20),1),100);
 else
  return query with candidates as (
   select p.id from public.media_objects_pending_delete p
   where (p.claimed_at is null or p.claimed_at<clock_timestamp()-interval '10 minutes')
   and not exists(select 1 from public.moderation_media_objects m where m.bucket=p.bucket_id and m.object_path=p.object_path)
   and not exists(select 1 from public.media_cleanup_reservations r where r.bucket=p.bucket_id and r.object_path=p.object_path
    and r.completed_at is null and r.lease_until>clock_timestamp()-interval '1 minute')
   order by p.created_at,p.id for update of p skip locked limit least(greatest(coalesce(p_limit,20),1),100)
  ) update public.media_objects_pending_delete p set claimed_at=clock_timestamp() from candidates c
    where p.id=c.id returning p.id,p.bucket_id,p.object_path;
 end if;
end$$;
create function public.finish_media_cleanup_v1(p_bucket text,p_path text,p_lease uuid)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 perform 1 from public.media_cleanup_reservations r where r.bucket=p_bucket and r.object_path=p_path for update;
 if not public.check_media_cleanup_lease_v1(p_bucket,p_path,p_lease) then return false; end if;
 if exists(select 1 from storage.objects o where o.bucket_id=p_bucket and o.name=p_path) then return false; end if;
 update public.media_cleanup_reservations r set completed_at=clock_timestamp() where r.bucket=p_bucket and r.object_path=p_path;
 return true;
end$$;
do $$declare f record; begin
 for f in select p.oid::regprocedure signature,p.proname from pg_proc p where p.pronamespace='public'::regnamespace
 and p.proname in('guard_cleanup_media_reference_v1','claim_media_cleanup_v1','check_media_cleanup_lease_v1','finish_media_cleanup_v1','claim_media_cleanup_candidates_v1') loop
  execute format('revoke all on function %s from public,anon,authenticated,doji_employee,service_role',f.signature);
  if f.proname<>'guard_cleanup_media_reference_v1' then execute format('grant execute on function %s to service_role',f.signature); end if;
 end loop;
end$$;
commit;
