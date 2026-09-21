import { useEffect, useState } from 'react';
import { Image as ExpoImage } from 'expo-image';
import type { Post } from '../types/database';
import {
  hasPrivatePostMedia,
  postMediaCacheKey,
  signPostMedia,
  type PostMediaVariant,
} from '../lib/postMedia';

type ResolvedPostMedia = Pick<Post, 'photo_url' | 'front_photo_url' | 'video_url'>;

function mediaOf(post: Post): ResolvedPostMedia {
  return {
    photo_url: post.photo_url,
    front_photo_url: post.front_photo_url,
    video_url: post.video_url,
  };
}

function asFileUri(path: string | null): string | null {
  if (!path) return null;
  return path.includes('://') ? path : `file://${path}`;
}

async function cachedImageUri(
  value: string | null,
  variant: PostMediaVariant,
): Promise<string | null> {
  const cacheKey = postMediaCacheKey(value, variant);
  if (!cacheKey) return null;
  return asFileUri(await ExpoImage.getCachePathAsync(cacheKey));
}

/** Resolve private media only for a visible, unlocked card. */
export function usePostMedia(
  post: Post,
  enabled: boolean,
  variant: PostMediaVariant = 'feed',
): ResolvedPostMedia {
  const [media, setMedia] = useState<ResolvedPostMedia>(() =>
    enabled && hasPrivatePostMedia(post)
      ? { photo_url: null, front_photo_url: null, video_url: null }
      : mediaOf(post),
  );
  const postId = post.id;
  const photoUrl = post.photo_url;
  const frontPhotoUrl = post.front_photo_url;
  const videoUrl = post.video_url;

  useEffect(() => {
    let active = true;
    let signedApplied = false;
    const mediaPost = {
      id: postId,
      photo_url: photoUrl,
      front_photo_url: frontPhotoUrl,
      video_url: videoUrl,
    } as Post;
    if (!enabled || !hasPrivatePostMedia(mediaPost)) {
      setMedia(mediaOf(mediaPost));
      return () => {
        active = false;
      };
    }
    // Preserve the card dimensions but do not hand authenticated object URLs
    // directly to the image component while their bearer URLs are resolving.
    setMedia({ photo_url: null, front_photo_url: null, video_url: null });
    // The authorized feed record contains stable object identities. Reuse the
    // corresponding native disk bytes immediately while a fresh short-lived
    // signed URL is obtained in parallel. Signed URLs themselves are never
    // persisted, and inaccessible posts never reach this enabled path.
    void Promise.all([
      cachedImageUri(photoUrl, variant),
      cachedImageUri(frontPhotoUrl, variant),
    ]).then(([cachedPhoto, cachedFront]) => {
      if (!active || signedApplied || (!cachedPhoto && !cachedFront)) return;
      setMedia((current) => ({
        ...current,
        photo_url: cachedPhoto,
        front_photo_url: cachedFront,
      }));
    });
    void signPostMedia([mediaPost], variant).then(([resolved]) => {
      if (!active || !resolved) return;
      signedApplied = true;
      setMedia(mediaOf(resolved));
    });
    return () => {
      active = false;
    };
  }, [enabled, postId, photoUrl, frontPhotoUrl, videoUrl, variant]);

  return media;
}
