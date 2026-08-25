-- Challenge proof is social content, not a public CDN asset. The database
-- continues to store a stable object reference, while authorized clients
-- exchange that reference for a short-lived signed URL after a feed/detail
-- RPC has already approved the viewer.
update storage.buckets
set public = false
where id = 'post-media';

create index if not exists posts_photo_object_path_idx
  on public.posts (public.public_storage_object_path(photo_url, 'post-media'))
  where photo_url is not null;
create index if not exists posts_front_photo_object_path_idx
  on public.posts (public.public_storage_object_path(front_photo_url, 'post-media'))
  where front_photo_url is not null;
create index if not exists posts_video_object_path_idx
  on public.posts (public.public_storage_object_path(video_url, 'post-media'))
  where video_url is not null;

create or replace function public.can_read_post_media(
  p_object_path text,
  p_viewer uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
    from public.posts post
    where (
        public.public_storage_object_path(post.photo_url, 'post-media') = p_object_path
        or public.public_storage_object_path(post.front_photo_url, 'post-media') = p_object_path
        or public.public_storage_object_path(post.video_url, 'post-media') = p_object_path
      )
      and (
        exists (
          select 1 from public.profiles viewer
          where viewer.id = p_viewer and viewer.is_admin is true
        )
        or public.can_view_full_post(
          p_viewer,
          post.user_event_id,
          post.daily_event_id,
          post.user_id,
          coalesce(post.is_community_poll, false)
        )
      )
  ), false);
$$;

revoke all on function public.can_read_post_media(text, uuid)
  from public, anon;
grant execute on function public.can_read_post_media(text, uuid)
  to authenticated;

drop policy if exists "post_media_read" on storage.objects;
drop policy if exists "post_media_read_authorized" on storage.objects;
create policy "post_media_read_authorized"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'post-media'
    and public.can_read_post_media(name, (select auth.uid()))
  );

comment on function public.can_read_post_media(text, uuid) is
  'Authorizes existing and new post-media references through the same occurrence, completion, friendship, and block contract as full post visibility.';
