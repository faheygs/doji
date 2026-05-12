-- Restrict avatar uploads so each user can only create objects under their own folder (`{userId}/...`).
drop policy if exists "avatars_upload" on storage.objects;

create policy "avatars_upload" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.role() = 'authenticated'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
