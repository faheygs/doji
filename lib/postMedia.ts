import { supabase } from './supabase';
import type { Post, Report } from '../types/database';
const BUCKET = 'post-media';
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const SIGNED_URL_REFRESH_SKEW_MS = 60_000;
const MAX_SIGNED_URL_CACHE_ENTRIES = 2_000;
const TRANSFORM_SIGN_CONCURRENCY = 6;
const OBJECT_MARKER = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/post-media\//;
export type PostMediaVariant = 'original' | 'feed' | 'thumbnail';
type SignedRequest = { path: string; variant: PostMediaVariant };
const VARIANT_TRANSFORMS = {
  feed: { width: 1440, height: 1920, resize: 'cover' as const, quality: 90 },
  thumbnail: { width: 360, height: 360, resize: 'cover' as const, quality: 82 },
};
const VARIANT_CACHE_VERSION: Record<Exclude<PostMediaVariant, 'original'>, string> = {
  // v3 discards feed entries created by the retired decode/re-encode cache
  // seeding path. A feed cache entry now contains the exact CDN response bytes.
  feed: 'v3',
  thumbnail: 'v2',
};
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const pendingRequests = new Map<string, SignedRequest>();
let pendingWaiters: Array<{
  requests: SignedRequest[];
  resolve: (signed: Map<string, string>) => void;
}> = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;
function mediaTransformsEnabled(): boolean {
  return process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED === 'true';
}
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
function requestKey(request: SignedRequest): string {
  return `${request.variant}:${request.path}`;
}
async function forEachWithConcurrency<T>(
  values: T[],
  concurrency: number,
  operation: (value: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (cursor < values.length) {
        const value = values[cursor++];
        await operation(value);
      }
    }),
  );
}
async function flushSignedUrlBatch(): Promise<void> {
  batchTimer = null;
  const requests = [...pendingRequests.values()];
  const waiters = pendingWaiters;
  pendingRequests.clear();
  pendingWaiters = [];
  const signed = new Map<string, string>();
  if (requests.length > 0) {
    try {
      const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1_000;
      const transformsEnabled = mediaTransformsEnabled();
      const originals = transformsEnabled
        ? requests.filter((request) => request.variant === 'original')
        : requests;
      const originalPaths = [...new Set(originals.map((request) => request.path))];
      if (originalPaths.length > 0) {
        const { data, error } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(originalPaths, SIGNED_URL_TTL_SECONDS);
        if (!error) {
          for (const row of data ?? []) {
            if (!row.path || !row.signedUrl) continue;
            const matching = requests.filter((request) => request.path === row.path);
            for (const request of matching) {
              const key = requestKey(request);
              signed.set(key, row.signedUrl);
              signedUrlCache.set(key, { url: row.signedUrl, expiresAt });
            }
          }
        }
      }
      if (transformsEnabled) {
        await forEachWithConcurrency(
          requests.filter((request) => request.variant !== 'original'),
          TRANSFORM_SIGN_CONCURRENCY,
          async (request) => {
            let { data, error } = await supabase.storage
              .from(BUCKET)
              .createSignedUrl(request.path, SIGNED_URL_TTL_SECONDS, {
                transform: VARIANT_TRANSFORMS[request.variant as 'feed' | 'thumbnail'],
              });
            // Preserve image availability if the transformation service rejects
            // an uncommon source file or has a transient failure.
            if (error || !data?.signedUrl) {
              ({ data, error } = await supabase.storage
                .from(BUCKET)
                .createSignedUrl(request.path, SIGNED_URL_TTL_SECONDS));
            }
            if (error || !data?.signedUrl) return;
            const key = requestKey(request);
            signed.set(key, data.signedUrl);
            signedUrlCache.set(key, { url: data.signedUrl, expiresAt });
          },
        );
      }
      while (signedUrlCache.size > MAX_SIGNED_URL_CACHE_ENTRIES) {
        const oldest = signedUrlCache.keys().next().value as string | undefined;
        if (!oldest) break;
        signedUrlCache.delete(oldest);
      }
    } catch {
      // A media transport failure leaves the social record usable. A later
      // visible-card mount or query refresh can retry signing.
    }
  }
  for (const waiter of waiters) {
    waiter.resolve(
      new Map(
        waiter.requests.flatMap((request) => {
          const key = requestKey(request);
          const url = signed.get(key) ?? signedUrlCache.get(key)?.url;
          return url ? [[key, url] as const] : [];
        }),
      ),
    );
  }
}
function queueSignedUrls(requests: SignedRequest[]): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    for (const request of requests) pendingRequests.set(requestKey(request), request);
    pendingWaiters.push({ requests, resolve });
    // Cards mount in one render pass. A tiny coalescing window turns those
    // per-card needs into one Storage request without delaying feed chrome.
    if (!batchTimer) batchTimer = setTimeout(() => void flushSignedUrlBatch(), 24);
  });
}
async function signedUrlMap(
  values: Array<{ value: string | null | undefined; variant: PostMediaVariant }>,
): Promise<Map<string, string>> {
  const requests = new Map<string, SignedRequest>();
  for (const entry of values) {
    const path = objectPath(entry.value);
    if (!path) continue;
    const request = { path, variant: entry.variant };
    requests.set(requestKey(request), request);
  }
  if (requests.size === 0) return new Map();
  const now = Date.now();
  const result = new Map<string, string>();
  const missing: SignedRequest[] = [];
  for (const [key, request] of requests) {
    const cached = signedUrlCache.get(key);
    if (cached && cached.expiresAt - SIGNED_URL_REFRESH_SKEW_MS > now) {
      result.set(key, cached.url);
      signedUrlCache.delete(key);
      signedUrlCache.set(key, cached);
    } else {
      signedUrlCache.delete(key);
      missing.push(request);
    }
  }
  if (missing.length === 0) return result;
  const batched = await queueSignedUrls(missing);
  for (const [path, url] of batched) result.set(path, url);
  return result;
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
