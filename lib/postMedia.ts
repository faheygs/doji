import {
  getSignedMediaUrls,
  signedMediaKey as requestKey,
  type SignedMediaRequest,
  type PostMediaVariant,
} from './postMediaSigning';
export type { PostMediaVariant } from './postMediaSigning';
import type { Post, Report } from '../types/database';
const BUCKET = 'post-media';
const OBJECT_MARKER = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/post-media\//;
const VARIANT_CACHE_VERSION = { feed: 'v3', thumbnail: 'v2' } as const;
function objectPath(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = OBJECT_MARKER.exec(value);
  if (!match) return null;
  const encoded = value.slice(match.index + match[0].length).split(/[?#]/, 1)[0];
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}
/**
 * Signed URLs rotate, but committed post-media object paths are immutable.
 * Use the object identity as the native disk-cache key so reopening the app
 * does not download the same authorized image again under a new signature.
 */
export function postMediaCacheKey(
  value: string | null | undefined,
  variant: PostMediaVariant = 'original',
): string | undefined {
  const path = objectPath(value);
  if (!path) return undefined;
  return variant === 'original'
    ? `${BUCKET}:${path}`
    : `${BUCKET}:${variant}:${VARIANT_CACHE_VERSION[variant]}:${path}`;
}
async function signedUrlMap(
  values: Array<{ value: string | null | undefined; variant: PostMediaVariant }>,
): Promise<Map<string, string>> {
  const requests = new Map<string, SignedMediaRequest>();
  for (const entry of values) {
    const path = objectPath(entry.value);
    if (!path) continue;
    const request = { path, variant: entry.variant };
    requests.set(requestKey(request), request);
  }
  return getSignedMediaUrls([...requests.values()]);
}

export function hasPrivatePostMedia(post: Post): boolean {
  return [post.photo_url, post.front_photo_url, post.video_url].some(
    (value) => typeof value === 'string' && objectPath(value) != null,
  );
}

function resolved(
  value: string | null,
  signed: Map<string, string>,
  variant: PostMediaVariant,
): string | null {
  const path = objectPath(value);
  if (!path) return value;
  return signed.get(requestKey({ path, variant })) ?? null;
}

/** Replaces stable private object references only after the post read is authorized. */
export async function signPostMedia(
  posts: Post[],
  variant: PostMediaVariant = 'original',
): Promise<Post[]> {
  const signed = await signedUrlMap(
    posts.flatMap((post) => [
      { value: post.photo_url, variant },
      { value: post.front_photo_url, variant },
      { value: post.video_url, variant: 'original' },
    ]),
  );
  return posts.map((post) => ({
    ...post,
    photo_url: resolved(post.photo_url, signed, variant),
    front_photo_url: resolved(post.front_photo_url, signed, variant),
    video_url: resolved(post.video_url, signed, 'original'),
  }));
}

/** Admin report snapshots use the same private media transport after admin authorization. */
export async function signReportMedia(reports: Report[]): Promise<Report[]> {
  const signed = await signedUrlMap(
    reports.map((report) => ({ value: report.post?.photo_url, variant: 'feed' })),
  );
  return reports.map((report) => ({
    ...report,
    post: report.post
      ? { ...report.post, photo_url: resolved(report.post.photo_url, signed, 'feed') }
      : report.post,
  }));
}
