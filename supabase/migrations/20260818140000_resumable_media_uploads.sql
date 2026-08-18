-- Keep media transfer outside the post transaction while preserving one
-- server-owned, idempotent upload reservation per occurrence and media slot.

create table if not exists public.media_upload_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_event_id uuid not null references public.user_events(id) on delete cascade,
  idempotency_key text not null,
  slot text not null check (slot in ('photo', 'front', 'video')),
  bucket_id text not null default 'post-media' check (bucket_id = 'post-media'),
  object_path text not null unique,
  content_type text not null,
  created_at timestamptz not null default clock_timestamp(),
  committed_at timestamptz,
  unique (user_id, user_event_id, idempotency_key, slot)
);

alter table public.media_upload_intents enable row level security;

create policy "media_upload_intents_read_own"
  on public.media_upload_intents for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.media_upload_intents from public, anon, authenticated;
grant select on public.media_upload_intents to authenticated;

create index if not exists media_upload_intents_cleanup_idx
  on public.media_upload_intents (created_at, id)
  where committed_at is null;

create or replace function public.reserve_doji_media_upload(
  p_user_event_id uuid,
  p_idempotency_key text,
  p_slot text,
  p_extension text,
  p_content_type text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  event_row record;
  intent_row public.media_upload_intents%rowtype;
  clean_extension text := lower(trim(p_extension));
  participant_deadline timestamptz;
begin
  if uid is null then
    raise exception 'Authentication required';
  end if;
  if coalesce(length(p_idempotency_key), 0) < 16 then
    raise exception 'Invalid idempotency key';
  end if;
  if p_slot is null or p_slot not in ('photo', 'front', 'video') then
    raise exception 'Invalid media slot';
  end if;
  if clean_extension is null or clean_extension not in ('jpg', 'mp4', 'mov', 'webm') then
    raise exception 'Unsupported media extension';
  end if;
  if p_content_type is null
     or (p_slot in ('photo', 'front') and p_content_type <> 'image/jpeg')
     or (p_slot = 'video' and p_content_type not in
       ('video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v')) then
    raise exception 'Unsupported media type';
  end if;

  select participant.status, participant.expires_at, participant.signup_day_grace,
         event.activated_at, event.closes_at
  into event_row
  from public.user_events participant
  join public.daily_events event on event.id = participant.daily_event_id
  where participant.id = p_user_event_id and participant.user_id = uid
  for update of participant;

  if not found then
    raise exception 'Doji not found';
  end if;
  if event_row.status not in ('pending', 'buy_in_open') then
    raise exception 'Doji is no longer open';
  end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then
    raise exception 'Doji is not live yet';
  end if;
  participant_deadline := case
    when event_row.signup_day_grace then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;
  if event_row.status = 'pending' and clock_timestamp() >= participant_deadline then
    raise exception 'Doji has closed';
  end if;

  insert into public.media_upload_intents (
    user_id, user_event_id, idempotency_key, slot, object_path, content_type
  ) values (
    uid,
    p_user_event_id,
    p_idempotency_key,
    p_slot,
    uid::text || '/events/' || p_user_event_id::text || '/' ||
      gen_random_uuid()::text || '-' || p_slot || '.' || clean_extension,
    p_content_type
  )
  on conflict (user_id, user_event_id, idempotency_key, slot) do update
  set object_path = public.media_upload_intents.object_path
  returning * into intent_row;

  return jsonb_build_object(
    'id', intent_row.id,
    'bucket_id', intent_row.bucket_id,
    'object_path', intent_row.object_path,
    'content_type', intent_row.content_type
  );
end;
$$;

revoke all on function public.reserve_doji_media_upload(uuid, text, text, text, text)
  from public, anon;
grant execute on function public.reserve_doji_media_upload(uuid, text, text, text, text)
  to authenticated;

-- Uploads must be user-scoped. Bucket limits reject oversized or unexpected
-- objects before the storage service persists them.
update storage.buckets
set file_size_limit = 104857600,
    allowed_mime_types = array[
      'image/jpeg', 'video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v'
    ]::text[]
where id = 'post-media';

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg']::text[]
where id = 'avatars';

drop policy if exists "post_media_upload" on storage.objects;
drop policy if exists "post_media_update_own" on storage.objects;

create policy "post_media_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and owner_id = (select auth.uid()::text)
  );

create policy "post_media_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'post-media'
    and owner_id = (select auth.uid()::text)
  )
  with check (
    bucket_id = 'post-media'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and owner_id = (select auth.uid()::text)
  );

drop policy if exists "avatars_update" on storage.objects;
create policy "avatars_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and owner_id = (select auth.uid()::text))
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and owner_id = (select auth.uid()::text)
  );

-- The post command accepts only media that was reserved by this user for this
-- exact idempotent occurrence command. A URL from another user cannot be linked.
create or replace function public.complete_doji_with_post(
  p_user_event_id uuid,
  p_post_type text,
  p_caption text,
  p_photo_url text,
  p_front_photo_url text,
  p_video_url text,
  p_visibility text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  event_row record;
  participant_deadline timestamptz;
  post_row record;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if length(p_idempotency_key) < 16 then raise exception 'Invalid idempotency key'; end if;

  select participant.*, event.activated_at, event.closes_at,
         challenge.type as challenge_type,
         challenge.requires_photo, challenge.requires_video, challenge.requires_text
  into event_row
  from public.user_events participant
  join public.daily_events event on event.id = participant.daily_event_id
  join public.challenges challenge on challenge.id = event.challenge_id
  where participant.id = p_user_event_id and participant.user_id = uid
  for update of participant;
  if not found then raise exception 'Doji not found'; end if;

  select * into post_row
  from public.posts post
  where post.user_event_id = p_user_event_id or post.idempotency_key = p_idempotency_key
  order by (post.user_event_id = p_user_event_id) desc
  limit 1;
  if found then return to_jsonb(post_row); end if;

  if exists (
    select 1 from (values
      ('photo'::text, p_photo_url),
      ('front'::text, p_front_photo_url),
      ('video'::text, p_video_url)
    ) supplied(slot, media_url)
    where supplied.media_url is not null
      and not exists (
        select 1
        from public.media_upload_intents intent
        where intent.user_id = uid
          and intent.user_event_id = p_user_event_id
          and intent.idempotency_key = p_idempotency_key
          and intent.slot = supplied.slot
          and supplied.media_url like
            '%/storage/v1/object/public/' || intent.bucket_id || '/' || intent.object_path || '%'
      )
  ) then
    raise exception 'Invalid media upload';
  end if;

  if event_row.challenge_type = 'poll' then
    raise exception 'Poll challenges must use the poll vote command';
  end if;
  if p_post_type not in ('photo', 'task_complete') then
    raise exception 'Invalid post type';
  end if;
  if (event_row.challenge_type = 'photo' and p_post_type <> 'photo')
     or (event_row.challenge_type in ('task', 'format') and p_post_type <> 'task_complete') then
    raise exception 'Post type does not match this challenge';
  end if;
  if coalesce(event_row.requires_photo, false) and p_photo_url is null then
    raise exception 'A photo is required';
  end if;
  if coalesce(event_row.requires_video, false) and p_video_url is null then
    raise exception 'A video is required';
  end if;
  if coalesce(event_row.requires_text, false) and nullif(trim(p_caption), '') is null then
    raise exception 'A response is required';
  end if;
  if length(coalesce(p_caption, '')) > 1000 then
    raise exception 'Response is too long';
  end if;
  if p_visibility not in ('friends', 'public') then
    raise exception 'Invalid post visibility';
  end if;

  participant_deadline := case
    when event_row.signup_day_grace is true then event_row.expires_at
    else coalesce(event_row.closes_at, event_row.expires_at)
  end;
  if event_row.status not in ('pending', 'buy_in_open') then
    raise exception 'Doji is no longer open';
  end if;
  if event_row.activated_at is null or clock_timestamp() < event_row.activated_at then
    raise exception 'Doji is not live yet';
  end if;
  if event_row.status = 'pending' and clock_timestamp() >= participant_deadline then
    raise exception 'Doji has closed';
  end if;

  insert into public.posts (
    user_event_id, user_id, type, caption, photo_url, front_photo_url,
    video_url, is_late, visibility, idempotency_key
  ) values (
    p_user_event_id, uid, p_post_type, nullif(trim(p_caption), ''), p_photo_url,
    p_front_photo_url, p_video_url, event_row.status = 'buy_in_open',
    p_visibility, p_idempotency_key
  ) returning * into post_row;

  update public.user_events
  set status = case when event_row.status = 'buy_in_open' then 'late' else 'completed' end,
      completed_at = clock_timestamp()
  where id = p_user_event_id;

  update public.media_upload_intents
  set committed_at = clock_timestamp()
  where user_id = uid
    and user_event_id = p_user_event_id
    and idempotency_key = p_idempotency_key;

  return to_jsonb(post_row);
end;
$$;

revoke all on function public.complete_doji_with_post(uuid, text, text, text, text, text, text, text)
  from public, anon;
grant execute on function public.complete_doji_with_post(uuid, text, text, text, text, text, text, text)
  to authenticated;

create or replace function public.claim_expired_media_upload_intents(p_limit integer default 500)
returns table (id uuid, bucket_id text, object_path text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  return query
  select intent.id, intent.bucket_id, intent.object_path
  from public.media_upload_intents intent
  where intent.committed_at is null
    and intent.created_at < clock_timestamp() - interval '24 hours'
  order by intent.created_at, intent.id
  for update skip locked
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

revoke all on function public.claim_expired_media_upload_intents(integer)
  from public, anon, authenticated;
grant execute on function public.claim_expired_media_upload_intents(integer) to service_role;

create or replace function public.delete_media_upload_intents(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare deleted_count integer;
begin
  if auth.role() <> 'service_role' then raise exception 'Forbidden'; end if;
  delete from public.media_upload_intents
  where id = any(p_ids) and committed_at is null;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_media_upload_intents(uuid[])
  from public, anon, authenticated;
grant execute on function public.delete_media_upload_intents(uuid[]) to service_role;
