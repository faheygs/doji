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

/** Resolve private media only for a visible, unlocked card. */
export function usePostMedia(
  post: Post,
  enabled: boolean,
  variant: PostMediaVariant = 'feed',
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
  const retry = useCallback(() => setRecovery((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    // QueryLifecycle publishes native foreground/reconnect availability once.
    // Hidden cards subscribe to nothing; no per-card polling or network probes.
    return onlineManager.subscribe((online) => {
      if (online) setRecovery((value) => value + 1);
    });
  }, [enabled]);

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
      setMedia({
        identity,
        value: hasPrivatePostMedia(mediaPost) ? EMPTY_MEDIA : mediaOf(mediaPost),
        error: null,
      });
      return () => {
        active = false;
      };
    }
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
    void Promise.all([
      cachedImageUri(photoUrl, variant),
      cachedImageUri(frontPhotoUrl, variant),
    ]).then(([cachedPhoto, cachedFront]) => {
      if (!active || signedApplied || (!cachedPhoto && !cachedFront)) return;
      setMedia({
        identity,
        value: { photo_url: cachedPhoto, front_photo_url: cachedFront, video_url: null },
        error: cachedPhoto
          ? null
          : onlineManager.isOnline()
            ? null
            : 'Media is unavailable offline.',
      });
    });
    if (onlineManager.isOnline())
      void signPostMedia([mediaPost], variant)
        .then(([resolved]) => {
          if (!active) return;
          signedApplied = true;
          const value = resolved ? mediaOf(resolved) : EMPTY_MEDIA;
          setMedia({
            identity,
            value,
            error: value.photo_url || value.video_url ? null : 'Media could not be loaded.',
          });
        })
        .catch(() => {
          if (!active) return;
          signedApplied = true;
          setMedia({ identity, value: EMPTY_MEDIA, error: 'Media could not be loaded.' });
        });
    return () => {
      active = false;
    };
  }, [enabled, postId, photoUrl, frontPhotoUrl, videoUrl, variant, identity, recovery]);

  // Effects run after render: never briefly expose the previous row's signed URL.
  return {
    ...(media.identity === identity ? media.value : initial),
    error: media.identity === identity ? media.error : null,
    retry,
    recoveryVersion: recovery,
  };
}
