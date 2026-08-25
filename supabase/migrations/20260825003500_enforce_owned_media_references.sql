-- A public URL is not proof that an upload exists or belongs to the actor.
-- Enforce that profile and post media references resolve to owned Storage
-- objects. Post media must additionally match the server-issued reservation
-- for the exact occurrence command and media slot.

create or replace function public.public_storage_object_path(
  p_url text,
  p_bucket text
)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  matches text[];
begin
  if p_url is null or p_bucket is null then return null; end if;
  if p_bucket not in ('avatars', 'post-media') then return null; end if;

  matches := regexp_match(
    trim(p_url),
    '^https?://[^/?#]+/storage/v1/object/public/' || p_bucket || '/([^?#]+)(?:[?#].*)?$'
  );
  return case when matches is null then null else matches[1] end;
end;
$$;

revoke all on function public.public_storage_object_path(text, text)
  from public, anon, authenticated;

create or replace function public.enforce_owned_profile_avatar()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  object_path text;
begin
  if new.avatar_url is null then return new; end if;
  if tg_op = 'UPDATE' and new.avatar_url is not distinct from old.avatar_url then
    return new;
  end if;

  object_path := public.public_storage_object_path(new.avatar_url, 'avatars');
  if object_path is null
     or object_path not like new.id::text || '/%'
     or not exists (
       select 1
       from storage.objects object
       where object.bucket_id = 'avatars'
         and object.name = object_path
         and object.owner_id = new.id::text
         and coalesce(object.metadata ->> 'mimetype', 'image/jpeg') = 'image/jpeg'
     ) then
    raise exception 'Invalid profile photo';
  end if;
  return new;
end;
$$;

drop trigger if exists enforce_owned_profile_avatar on public.profiles;
create trigger enforce_owned_profile_avatar
before insert or update of avatar_url on public.profiles
for each row execute function public.enforce_owned_profile_avatar();

revoke all on function public.enforce_owned_profile_avatar()
  from public, anon, authenticated;

create or replace function public.enforce_reserved_post_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied record;
  object_path text;
begin
  for supplied in
    select * from (values
      ('photo'::text, new.photo_url),
      ('front'::text, new.front_photo_url),
      ('video'::text, new.video_url)
    ) media(slot, media_url)
    where media.media_url is not null
  loop
    object_path := public.public_storage_object_path(supplied.media_url, 'post-media');
    if object_path is null or not exists (
      select 1
      from public.media_upload_intents intent
      join storage.objects object
        on object.bucket_id = intent.bucket_id
       and object.name = intent.object_path
       and object.owner_id = intent.user_id::text
      where intent.user_id = new.user_id
        and intent.user_event_id = new.user_event_id
        and intent.idempotency_key = new.idempotency_key
        and intent.slot = supplied.slot
        and intent.bucket_id = 'post-media'
        and intent.object_path = object_path
        and (
          object.metadata ->> 'mimetype' is null
          or object.metadata ->> 'mimetype' = intent.content_type
        )
    ) then
      raise exception 'Invalid media upload';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists enforce_reserved_post_media on public.posts;
create trigger enforce_reserved_post_media
before insert or update of photo_url, front_photo_url, video_url on public.posts
for each row execute function public.enforce_reserved_post_media();

revoke all on function public.enforce_reserved_post_media()
  from public, anon, authenticated;
