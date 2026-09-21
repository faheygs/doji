import { Image as ExpoImage } from 'expo-image';
import type { Post } from '../types/database';
import { postMediaCacheKey, signPostMedia } from './postMedia';

export const FEED_POST_PREPARATION_TIMEOUT_MS = 8_000;

export function feedPostPreparationKey(post: Post): string {
  return `${post.id}:${post.photo_url ?? ''}:${post.front_photo_url ?? ''}:${post.video_url ?? ''}`;
}

export function feedPostNeedsPreparation(post: Post): boolean {
  return Boolean(post.photo_url || post.front_photo_url || post.video_url);
}

function asFileUri(path: string | null): string | null {
  if (!path) return null;
  return path.includes('://') ? path : `file://${path}`;
}

async function prepareImage(
  stableReference: string | null,
  resolvedUrl: string | null,
): Promise<string | null> {
  if (!stableReference) return null;
  if (!resolvedUrl) throw new Error('Post media could not be authorized');
  const cacheKey = postMediaCacheKey(stableReference, 'feed');
  const image = await ExpoImage.loadAsync(
    cacheKey ? { uri: resolvedUrl, cacheKey } : { uri: resolvedUrl },
    // Do not retain a full-resolution camera bitmap merely to prime a feed
    // card. The signed feed variant is already bounded, and these guards keep
    // unusual legacy uploads from causing a native memory spike.
    { maxWidth: 1440, maxHeight: 1920 },
  );
  try {
    if (!cacheKey) return resolvedUrl;
    await ExpoImage.writeToCacheAsync(image, cacheKey);
    return asFileUri(await ExpoImage.getCachePathAsync(cacheKey)) ?? resolvedUrl;
  } finally {
    // ImageRef owns a native bitmap. Waiting for JavaScript garbage collection
    // leaked several decoded photos during a burst and could trip ErrorBoundary.
    image.release();
  }
}

/**
 * Resolve, download, and decode each post's render-critical media. A failed post
 * is omitted from the result so callers can retain it behind a bounded fallback
 * instead of exposing a half-loaded card.
 */
export async function prepareFeedPostMedia(posts: Post[]): Promise<Map<string, Post>> {
  if (posts.length === 0) return new Map();
  const resolvedPosts = await signPostMedia(posts, 'feed');
  const prepared = await Promise.all(
    posts.map(async (post, index): Promise<[string, Post] | null> => {
      const resolved = resolvedPosts[index];
      if (!resolved) return null;
      try {
        const [photoUrl, frontPhotoUrl] = await Promise.all([
          prepareImage(post.photo_url, resolved.photo_url),
          prepareImage(post.front_photo_url, resolved.front_photo_url),
        ]);
        if (post.video_url && !resolved.video_url) return null;
        return [
          feedPostPreparationKey(post),
          {
            ...post,
            photo_url: photoUrl,
            front_photo_url: frontPhotoUrl,
            video_url: resolved.video_url,
          },
        ];
      } catch {
        return null;
      }
    }),
  );
  return new Map(prepared.filter((entry): entry is [string, Post] => entry != null));
}
