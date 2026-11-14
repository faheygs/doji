import { useCallback, useEffect, useMemo, useState } from 'react';
import { onlineManager } from '@tanstack/react-query';
import { Image as ExpoImage } from 'expo-image';
import type { Post } from '../types/database';
import {
  hasPrivatePostMedia,
  postMediaCacheKey,
  signPostMedia,
  type PostMediaVariant,
} from '../lib/postMedia';

type ResolvedPostMedia = Pick<Post, 'photo_url' | 'front_photo_url' | 'video_url'>;
const EMPTY_MEDIA: ResolvedPostMedia = { photo_url: null, front_photo_url: null, video_url: null };

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
  try {
    return asFileUri(await ExpoImage.getCachePathAsync(cacheKey));
  } catch {
    return null;
  } // Disk failure must not suppress the other image or network resolution.
}

/** Authorization controls retention; visibility/lookahead controls new I/O. */
export function usePostMedia(
  post: Post,
  enabled: boolean,
  variant: PostMediaVariant = 'feed',
  active = true,
): ResolvedPostMedia & { error: string | null; retry: () => void; recoveryVersion: number } {
  const postId = post.id;
  const photoUrl = post.photo_url;
  const frontPhotoUrl = post.front_photo_url;
  const videoUrl = post.video_url;
  const identity = useMemo(
    () => JSON.stringify([postId, photoUrl, frontPhotoUrl, videoUrl, variant, enabled]),
    [postId, photoUrl, frontPhotoUrl, videoUrl, variant, enabled],
  );
  const initial = hasPrivatePostMedia(post) ? EMPTY_MEDIA : mediaOf(post);
  const [media, setMedia] = useState(() => ({
    identity,
    value: initial,
    error: null as string | null,
  }));
  const [recovery, setRecovery] = useState(0);
  const [failedDiskIdentity, setFailedDiskIdentity] = useState<string | null>(null);
  const bypassDisk = failedDiskIdentity === identity;
  const retry = useCallback(() => {
    setFailedDiskIdentity(identity);
    setRecovery((value) => value + 1);
  }, [identity]);

  useEffect(() => {
    if (!enabled || !active) return;
    // QueryLifecycle publishes native foreground/reconnect availability once.
    // Hidden cards subscribe to nothing; no per-card polling or network probes.
    return onlineManager.subscribe((online) => {
      if (online) setRecovery((value) => value + 1);
    });
  }, [enabled, active]);

  useEffect(() => {
    let live = true;
    let signedApplied = false;
    const mediaPost = {
      id: postId,
      photo_url: photoUrl,
      front_photo_url: frontPhotoUrl,
      video_url: videoUrl,
    } as Post;
    if (!enabled || !hasPrivatePostMedia(mediaPost)) {
      setMedia({
        identity,
        value: hasPrivatePostMedia(mediaPost) ? EMPTY_MEDIA : mediaOf(mediaPost),
        error: null,
      });
      return () => {
        live = false;
      };
    }
    // Leaving the viewport is not loss of authorization. Retain this mounted
    // row's displayed image instead of unmounting it and replaying its skeleton.
    if (!active) return;
    // Preserve the card dimensions but do not hand authenticated object URLs
    // directly to the image component while their bearer URLs are resolving.
    setMedia((current) => ({
      identity,
      value: current.identity === identity ? current.value : EMPTY_MEDIA,
      error: onlineManager.isOnline() ? null : 'Media is unavailable offline.',
    }));
    // The authorized feed record contains stable object identities. Reuse the
    // corresponding native disk bytes immediately while a fresh short-lived
    // signed URL is obtained in parallel. Signed URLs themselves are never
    // persisted, and inaccessible posts never reach this enabled path.
    if (!bypassDisk)
      void Promise.all([
        cachedImageUri(photoUrl, variant),
        cachedImageUri(frontPhotoUrl, variant),
      ]).then(([cachedPhoto, cachedFront]) => {
        if (!live || signedApplied || (!cachedPhoto && !cachedFront)) return;
        setMedia((current) => ({
          identity,
          value:
            current.identity === identity && (current.value.photo_url || current.value.video_url)
              ? current.value
              : { photo_url: cachedPhoto, front_photo_url: cachedFront, video_url: null },
          error: cachedPhoto
            ? null
            : onlineManager.isOnline()
              ? null
              : 'Media is unavailable offline.',
        }));
      });
    if (onlineManager.isOnline())
      void signPostMedia([mediaPost], variant)
        .then(([resolved]) => {
          if (!live) return;
          signedApplied = true;
          const value = resolved ? mediaOf(resolved) : EMPTY_MEDIA;
          setMedia((current) => ({
            identity,
            value: {
              ...value,
              photo_url:
                !bypassDisk &&
                value.photo_url &&
                current.identity === identity &&
                current.value.photo_url?.startsWith('file://')
                  ? current.value.photo_url
                  : value.photo_url,
              front_photo_url:
                !bypassDisk &&
                value.front_photo_url &&
                current.identity === identity &&
                current.value.front_photo_url?.startsWith('file://')
                  ? current.value.front_photo_url
                  : value.front_photo_url,
            },
            error: value.photo_url || value.video_url ? null : 'Media could not be loaded.',
          }));
        })
        .catch(() => {
          if (!live) return;
          signedApplied = true;
          setMedia({ identity, value: EMPTY_MEDIA, error: 'Media could not be loaded.' });
        });
    return () => {
      live = false;
    };
  }, [
    enabled,
    active,
    postId,
    photoUrl,
    frontPhotoUrl,
    videoUrl,
    variant,
    identity,
    recovery,
    bypassDisk,
  ]);

  // Effects run after render: never briefly expose the previous row's signed URL.
  return {
    ...(media.identity === identity ? media.value : initial),
    error: media.identity === identity ? media.error : null,
    retry,
    recoveryVersion: recovery,
  };
}
