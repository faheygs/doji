import { Image as ExpoImage } from 'expo-image';
import { File as ExpoFile, Paths } from 'expo-file-system';
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
  const decodeOptions = { maxWidth: 1440, maxHeight: 1920 };

  if (!cacheKey) {
    const image = await ExpoImage.loadAsync(resolvedUrl, decodeOptions);
    image.release();
    return resolvedUrl;
  }

  const temporaryFile = new ExpoFile(
    Paths.cache,
    `doji-feed-${Date.now()}-${Math.random().toString(36).slice(2)}.img`,
  );
  let image: Awaited<ReturnType<typeof ExpoImage.loadAsync>> | null = null;
  try {
    const downloadedFile = await ExpoFile.downloadFileAsync(
      resolvedUrl,
      temporaryFile,
      { idempotent: true },
    );
    // Decode once to prove the complete response is renderable, but seed the
    // stable cache from the downloaded file—not the decoded bitmap. Passing an
    // ImageRef here forces native re-encoding and compounds quality loss when
    // preparation runs again.
    image = await ExpoImage.loadAsync(downloadedFile.uri, decodeOptions);
    await ExpoImage.writeToCacheAsync(downloadedFile.uri, cacheKey);
    return asFileUri(await ExpoImage.getCachePathAsync(cacheKey)) ?? resolvedUrl;
  } finally {
    image?.release();
    if (temporaryFile.exists) temporaryFile.delete();
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
