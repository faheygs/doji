import { supabase } from './supabase';
import type { Post, Report } from '../types/database';

const BUCKET = 'post-media';
const SIGNED_URL_TTL_SECONDS = 15 * 60;
const SIGNED_URL_REFRESH_SKEW_MS = 60_000;
const MAX_SIGNED_URL_CACHE_ENTRIES = 2_000;
const OBJECT_MARKER = /\/storage\/v1\/object\/(?:public|sign|authenticated)\/post-media\//;
const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

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

async function signedUrlMap(values: Array<string | null | undefined>): Promise<Map<string, string>> {
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
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);
  // Media is secondary to the social record. A stale object reference or a
  // temporary Storage outage must not make the entire feed/comments/report
  // query fail; unresolved private objects render as unavailable instead.
  if (error) return result;
  const expiresAt = now + SIGNED_URL_TTL_SECONDS * 1_000;
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) {
      result.set(row.path, row.signedUrl);
      signedUrlCache.set(row.path, { url: row.signedUrl, expiresAt });
    }
  }
  while (signedUrlCache.size > MAX_SIGNED_URL_CACHE_ENTRIES) {
    const oldest = signedUrlCache.keys().next().value as string | undefined;
    if (!oldest) break;
    signedUrlCache.delete(oldest);
  }
  return result;
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
