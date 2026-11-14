import { supabase } from './supabase';

export type PostMediaVariant = 'original' | 'feed' | 'thumbnail';
export type SignedMediaRequest = { path: string; variant: PostMediaVariant };
export const signedMediaKey = (request: SignedMediaRequest) => `${request.variant}:${request.path}`;
const TTL_SECONDS = 900,
  REFRESH_SKEW_MS = 60_000,
  WAIT_MS = 8_000,
  CONCURRENCY = 6;
const TRANSFORMS = {
  feed: { width: 1440, height: 1920, resize: 'cover' as const, quality: 90 },
  thumbnail: { width: 360, height: 360, resize: 'cover' as const, quality: 82 },
};
type Entry = {
  request: SignedMediaRequest;
  key: string;
  transformed: boolean;
  ready: boolean;
  started: boolean;
  settled: boolean;
  deadlineAt: number;
  promise: Promise<string | undefined>;
  resolve: (url?: string) => void;
  timer: ReturnType<typeof setTimeout>;
};
const cache = new Map<string, { url: string; expiresAt: number }>();
const pending = new Map<string, Entry>();
let active = 0;
let batchTimer: ReturnType<typeof setTimeout> | null = null;

function settle(entry: Entry, url?: string, expiresAt = 0) {
  if (entry.settled) return;
  entry.settled = true;
  clearTimeout(entry.timer);
  if (Date.now() >= entry.deadlineAt) url = undefined;
  if (url) {
    cache.set(entry.key, { url, expiresAt });
    while (cache.size > 2_000) cache.delete(cache.keys().next().value!);
  }
  entry.resolve(url);
  if (!entry.started) pending.delete(entry.key);
}

async function sign(entries: Entry[]): Promise<Map<string, string>> {
  const storage = supabase.storage.from('post-media');
  const first = entries[0];
  if (first.transformed) {
    const { path, variant } = first.request;
    let { data, error } = await storage.createSignedUrl(path, TTL_SECONDS, {
      transform: TRANSFORMS[variant as 'feed' | 'thumbnail'],
    });
    if (first.settled || Date.now() >= first.deadlineAt) return new Map();
    // Keep the existing original-image fallback for rejected transformations.
    if (error || !data?.signedUrl)
      ({ data, error } = await storage.createSignedUrl(path, TTL_SECONDS));
    return !error && data?.signedUrl ? new Map([[first.key, data.signedUrl]]) : new Map();
  }
  const paths = [...new Set(entries.map((entry) => entry.request.path))];
  const { data, error } = await storage.createSignedUrls(paths, TTL_SECONDS);
  const byPath = new Map<string, string>();
  if (!error)
    for (const row of data ?? [])
      if (row.path && row.signedUrl) byPath.set(row.path, row.signedUrl);
  return new Map(
    entries.flatMap((entry) => {
      const url = byPath.get(entry.request.path);
      return url ? [[entry.key, url] as const] : [];
    }),
  );
}

async function run(entries: Entry[]) {
  active += 1;
  for (const entry of entries) entry.started = true;
  const expiresAt = Date.now() + TTL_SECONDS * 1_000;
  try {
    const signed = await sign(entries);
    for (const entry of entries) settle(entry, signed.get(entry.key), expiresAt);
  } catch {
    // One failed provider operation must not strand unrelated cards or workers.
    for (const entry of entries) settle(entry);
  } finally {
    for (const entry of entries) pending.delete(entry.key);
    active -= 1;
    pump();
  }
}

function pump() {
  for (const entry of pending.values()) {
    if (active >= CONCURRENCY) return;
    if (!entry.ready || entry.started || entry.settled) continue;
    const batch = entry.transformed
      ? [entry]
      : [...pending.values()].filter(
          (candidate) =>
            candidate.ready && !candidate.started && !candidate.settled && !candidate.transformed,
        );
    void run(batch);
  }
}

function signedUrl(request: SignedMediaRequest): Promise<string | undefined> {
  const key = signedMediaKey(request);
  const cached = cache.get(key);
  if (cached && cached.expiresAt - REFRESH_SKEW_MS > Date.now()) {
    cache.delete(key);
    cache.set(key, cached);
    return Promise.resolve(cached.url);
  }
  cache.delete(key);
  const existing = pending.get(key);
  if (existing) return existing.promise;
  let resolve!: Entry['resolve'];
  const promise = new Promise<string | undefined>((done) => {
    resolve = done;
  });
  const entry: Entry = {
    request,
    key,
    transformed:
      request.variant !== 'original' && process.env.EXPO_PUBLIC_MEDIA_TRANSFORMS_ENABLED === 'true',
    ready: false,
    started: false,
    settled: false,
    deadlineAt: Date.now() + WAIT_MS,
    promise,
    resolve,
    // Include queue/auth time. A late result cannot warm the cache after timeout.
    timer: setTimeout(() => settle(entry), WAIT_MS),
  };
  pending.set(key, entry);
  if (!batchTimer)
    batchTimer = setTimeout(() => {
      batchTimer = null;
      for (const queued of pending.values()) queued.ready = true;
      pump();
    }, 24);
  return promise;
}

/** Coalesce authorized object needs; release each caller as soon as its own keys settle. */
export async function getSignedMediaUrls(
  requests: SignedMediaRequest[],
): Promise<Map<string, string>> {
  const entries = await Promise.all(
    requests.map(async (request) => {
      const url = await signedUrl(request);
      return url ? [[signedMediaKey(request), url] as const] : [];
    }),
  );
  return new Map(entries.flat());
}

// Storage signing has no cancellation parameter. Timed-out running entries keep
// their native slot and deduplication identity until settlement, preventing storms.
