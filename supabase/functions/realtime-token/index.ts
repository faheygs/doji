/// <reference path="../deno.d.ts" />
import { Rest } from 'npm:ably@2.26.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_REQUEST_BYTES = 16 * 1024;
const UPSTREAM_TIMEOUT_MS = 8_000;

function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init.signal ?? AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
}

async function withTimeout<T>(operation: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), UPSTREAM_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation, deadline]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

async function readBoundedJson(request: Request): Promise<{ postIds?: unknown }> {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    throw new RangeError('Realtime token request is too large');
  }

  const reader = request.body?.getReader();
  if (!reader) return {};

  const decoder = new TextDecoder();
  let body = '';
  let byteLength = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RangeError('Realtime token request is too large');
      }
      body += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  body += decoder.decode();
  if (!body.trim()) return {};

  const parsed: unknown = JSON.parse(body);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed as { postIds?: unknown };
}

Deno.serve(async (request) => {
  const startedAt = Date.now();
  const authorization = request.headers.get('authorization');
  if (!authorization) return new Response('Unauthorized', { status: 401 });

  const database = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: {
        headers: { Authorization: authorization },
        fetch: fetchWithTimeout,
      },
    },
  );
  const ablyKey = Deno.env.get('ABLY_API_KEY');
  if (!ablyKey) return new Response('Realtime service is not configured', { status: 500 });

  let requestBody: { postIds?: unknown } = {};
  if (request.method === 'POST') {
    try {
      requestBody = await readBoundedJson(request);
    } catch (error) {
      const status = error instanceof RangeError ? 413 : 400;
      return new Response(
        status === 413 ? 'Realtime token request is too large' : 'Invalid request body',
        { status },
      );
    }
  }
  const requestedPostIds = Array.isArray(requestBody.postIds)
    ? [...new Set(requestBody.postIds.filter(
      (value): value is string =>
        typeof value === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
    ))]
    : [];
  if (requestedPostIds.length > 64) {
    return new Response('Too many realtime post subscriptions', { status: 400 });
  }

  let capabilityData: unknown;
  try {
    const result = await database.rpc(
      'get_realtime_token_capabilities',
      { p_post_ids: requestedPostIds },
    );
    capabilityData = result.data;
    if (result.error || !capabilityData) {
      console.error('[realtime-token] capability lookup failed', JSON.stringify({
        stage: 'capability',
        durationMs: Date.now() - startedAt,
        requestedPostCount: requestedPostIds.length,
        error: result.error?.message ?? 'empty capability response',
      }));
      return Response.json(
        { code: 'CAPABILITY_UNAVAILABLE', message: 'Realtime authorization is temporarily unavailable', retryable: true },
        { status: 503 },
      );
    }
  } catch (error) {
    console.error('[realtime-token] capability request failed', JSON.stringify({
      stage: 'capability',
      durationMs: Date.now() - startedAt,
      requestedPostCount: requestedPostIds.length,
      error: error instanceof Error ? error.message : String(error),
    }));
    return Response.json(
      { code: 'CAPABILITY_TIMEOUT', message: 'Realtime authorization is temporarily unavailable', retryable: true },
      { status: 503 },
    );
  }
  const capabilityInput = capabilityData as {
    userId?: unknown;
    isAdmin?: unknown;
    authorizedPostIds?: unknown;
  };
  const userId = typeof capabilityInput.userId === 'string' ? capabilityInput.userId : null;
  if (!userId) return new Response('Unauthorized', { status: 401 });
  const isAdmin = capabilityInput.isAdmin === true;
  const authorizedPostIds = Array.isArray(capabilityInput.authorizedPostIds)
    ? capabilityInput.authorizedPostIds.filter(
      (value): value is string => typeof value === 'string',
    )
    : [];

  const ably = new Rest({ key: ablyKey });
  const capability: Record<string, string[]> = {
    'doji:global': ['subscribe'],
    'feed:public': ['subscribe'],
    'leaderboard:global': ['subscribe'],
    [`user:${userId}:events`]: ['subscribe'],
  };
  for (const postId of authorizedPostIds) {
    capability[`post:${postId}`] = ['subscribe'];
  }
  if (isAdmin) {
    capability['moderation:global'] = ['subscribe'];
  }

  try {
    const providerStartedAt = Date.now();
    const tokenRequest = await withTimeout(
      ably.auth.createTokenRequest({
        clientId: userId,
        // Short renewal bounds stale access after a friendship/block/privacy
        // change while still avoiding a token request per socket message.
        ttl: 15 * 60 * 1000,
        capability: JSON.stringify(capability),
      }),
      'Realtime provider authorization timed out',
    );
    console.info('[realtime-token] issued', JSON.stringify({
      durationMs: Date.now() - startedAt,
      providerDurationMs: Date.now() - providerStartedAt,
      requestedPostCount: requestedPostIds.length,
      authorizedPostCount: authorizedPostIds.length,
    }));
    return Response.json(tokenRequest);
  } catch (error) {
    console.error('[realtime-token] provider request failed', JSON.stringify({
      stage: 'provider',
      durationMs: Date.now() - startedAt,
      requestedPostCount: requestedPostIds.length,
      authorizedPostCount: authorizedPostIds.length,
      error: error instanceof Error ? error.message : String(error),
    }));
    return Response.json(
      { code: 'PROVIDER_UNAVAILABLE', message: 'Realtime provider is temporarily unavailable', retryable: true },
      { status: 503 },
    );
  }
});
