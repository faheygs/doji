import { supabase } from './supabase';
import type { Post, Report } from '../types/database';

const BUCKET = 'post-media';
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const SIGNED_URL_REFRESH_SKEW_MS = 60_000;
const MAX_SIGNED_URL_CACHE_ENTRIES = 2_000;
const OBJECT_MARKER = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/post-media\//;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();
const pendingPaths = new Set<string>();
let pendingWaiters: Array<{
  paths: string[];
  resolve: (signed: Map<string, string>) => void;
}> = [];
let batchTimer: ReturnType<typeof setTimeout> | null = null;

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
export function postMediaCacheKey(value: string | null | undefined): string | undefined {
  const path = objectPath(value);
  return path ? `${BUCKET}:${path}` : undefined;
}

async function flushSignedUrlBatch(): Promise<void> {
  batchTimer = null;
  const paths = [...pendingPaths];
  const waiters = pendingWaiters;
  pendingPaths.clear();
  pendingWaiters = [];
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
      if (!error) {
        const expiresAt = Date.now() + SIGNED_URL_TTL_SECONDS * 1_000;
        for (const row of data ?? []) {
          if (row.path && row.signedUrl) {
            signed.set(row.path, row.signedUrl);
            signedUrlCache.set(row.path, { url: row.signedUrl, expiresAt });
          }
        }
        while (signedUrlCache.size > MAX_SIGNED_URL_CACHE_ENTRIES) {
          const oldest = signedUrlCache.keys().next().value as string | undefined;
          if (!oldest) break;
          signedUrlCache.delete(oldest);
        }
      }
    } catch {
      // A media transport failure leaves the social record usable. A later
      // visible-card mount or query refresh can retry signing.
    }
  }
  for (const waiter of waiters) {
    waiter.resolve(
      new Map(
        waiter.paths.flatMap((path) => {
          const url = signed.get(path) ?? signedUrlCache.get(path)?.url;
          return url ? [[path, url] as const] : [];
        }),
      ),
    );
  }
}

function queueSignedUrls(paths: string[]): Promise<Map<string, string>> {
  return new Promise((resolve) => {
    for (const path of paths) pendingPaths.add(path);
    pendingWaiters.push({ paths, resolve });
    // Cards mount in one render pass. A tiny coalescing window turns those
    // per-card needs into one Storage request without delaying feed chrome.
    if (!batchTimer) batchTimer = setTimeout(() => void flushSignedUrlBatch(), 24);
  });
}

async function signedUrlMap(
  values: Array<string | null | undefined>,
): Promise<Map<string, string>> {
  const paths = [...new Set(values.map(objectPath).filter((path): path is string => !!path))];
  if (paths.length === 0) return new Map();
  const now = Date.now();
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const path of paths) {
    const cached = signedUrlCache.get(path);
    if (cached && cached.expiresAt - SIGNED_URL_REFRESH_SKEW_MS > now) {
      result.set(path, cached.url);
      signedUrlCache.delete(path);
      signedUrlCache.set(path, cached);
    } else {
      signedUrlCache.delete(path);
      missing.push(path);
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

function resolved(value: string | null, signed: Map<string, string>): string | null {
  const path = objectPath(value);
  if (!path) return value;
  return signed.get(path) ?? null;
}

/** Replaces stable private object references only after the post read is authorized. */
export async function signPostMedia(posts: Post[]): Promise<Post[]> {
  const signed = await signedUrlMap(
    posts.flatMap((post) => [post.photo_url, post.front_photo_url, post.video_url]),
  );
  return posts.map((post) => ({
    ...post,
    photo_url: resolved(post.photo_url, signed),
    front_photo_url: resolved(post.front_photo_url, signed),
    video_url: resolved(post.video_url, signed),
  }));
}

/** Admin report snapshots use the same private media transport after admin authorization. */
export async function signReportMedia(reports: Report[]): Promise<Report[]> {
  const signed = await signedUrlMap(reports.map((report) => report.post?.photo_url));
  return reports.map((report) => ({
    ...report,
    post: report.post
      ? { ...report.post, photo_url: resolved(report.post.photo_url, signed) }
      : report.post,
  }));
}
