-- Supabase Storage creates an object with INSERT ... RETURNING and resumable
-- upserts additionally require SELECT access. The normal post-media read
-- policy intentionally grants access only after a post exists, so a new
-- reserved upload otherwise deadlocks: the object cannot be returned until a
-- post references it, while the post cannot commit until the object exists.
--
-- Bridge only that pre-commit interval. The actor may read metadata for the
-- exact server-reserved object they own while its upload intent is uncommitted.
-- Once completion commits, the normal can_read_post_media policy takes over.

drop policy if exists "post_media_read_own_reserved_upload"
  on storage.objects;

create policy "post_media_read_own_reserved_upload"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'post-media'
    and owner_id = (select auth.uid()::text)
    and (storage.foldername(name))[1] = (select auth.uid()::text)
    and exists (
      select 1
      from public.media_upload_intents intent
      where intent.user_id = (select auth.uid())
        and intent.bucket_id = storage.objects.bucket_id
        and intent.object_path = storage.objects.name
        and intent.committed_at is null
    )
  );

comment on policy "post_media_read_own_reserved_upload" on storage.objects is
  'Allows Storage to return or upsert an actor-owned reserved object before the atomic post completion commits.';
