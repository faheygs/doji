-- Fix a PL/pgSQL identifier collision introduced by the owned-media trigger.
-- The previous local `object_path` variable collided with
-- media_upload_intents.object_path and rejected otherwise valid media posts.

create or replace function public.enforce_reserved_post_media()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supplied record;
  resolved_object_path text;
begin
  for supplied in
    select * from (values
      ('photo'::text, new.photo_url),
      ('front'::text, new.front_photo_url),
      ('video'::text, new.video_url)
    ) media(slot, media_url)
    where media.media_url is not null
  loop
    resolved_object_path := public.public_storage_object_path(
      supplied.media_url,
      'post-media'
    );

    if resolved_object_path is null or not exists (
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
        and intent.object_path = resolved_object_path
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

revoke all on function public.enforce_reserved_post_media()
  from public, anon, authenticated;

comment on function public.enforce_reserved_post_media() is
  'Validates each media reference against the exact actor-owned upload reservation without ambiguous PL/pgSQL identifiers.';
