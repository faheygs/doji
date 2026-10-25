import { type Realtime, type TokenRequest } from 'ably';
import { supabase } from './supabase';
import { recordRealtimeFailure } from './telemetry';

const AUTH_REQUEST_TIMEOUT_MS = 15_000;
const AUTHORIZATION_BATCH_MS = 80;
let authorizationTask: { realtime: Realtime; promise: Promise<void> } | null = null;
let tokenRequestTail: Promise<void> = Promise.resolve();
let grantedPostChannels = new Set<string>();
let lastRequestedChannels = new Set<string>();
let authorizationFailureCount = 0;
let authorizationRetryAt = 0;
let lifecycle = new AbortController();
const superseded = () => new Error('Realtime authorization was superseded');

export class RealtimeAccessUnavailableError extends Error {
  readonly code = 'REALTIME_ACCESS_UNAVAILABLE';

  constructor(channelName: string) {
    super(`Realtime access is unavailable for ${channelName}`);
    this.name = 'RealtimeAccessUnavailableError';
  }
}

export function isRealtimeAccessUnavailable(error: unknown): boolean {
  return error instanceof RealtimeAccessUnavailableError;
}

export function invalidatePostCapability(channelName: string): void {
  grantedPostChannels.delete(channelName);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController,
  lifetime: AbortSignal): Promise<T> {
  // React Native's AbortController does not implement AbortSignal.reason.
  let cancellationError = superseded();
  const cancel = () => controller.abort();
  const timer = setTimeout(() => {
    cancellationError = new Error(`Realtime authentication timed out after ${timeoutMs}ms`);
    controller.abort();
  }, timeoutMs);
  let abort!: () => void;
  const canceled = new Promise<never>((_, reject) => {
    abort = () => reject(cancellationError);
    controller.signal.addEventListener('abort', abort, { once: true });
    lifetime.addEventListener('abort', cancel, { once: true });
    if (lifetime.aborted) cancel();
  });
  try { return await Promise.race([promise, canceled]); }
  finally {
    clearTimeout(timer);
    lifetime.removeEventListener('abort', cancel);
    controller.signal.removeEventListener('abort', abort);
  }
}

function responseStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const value = error as { context?: unknown; status?: unknown; statusCode?: unknown };
  if (typeof value.status === 'number') return value.status;
  if (typeof value.statusCode === 'number') return value.statusCode;
  if (value.context && typeof value.context === 'object') {
    const status = (value.context as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  return null;
}

async function invokeRealtimeToken(postIds: string[], signal: AbortSignal, isCurrent: () => boolean) {
  const check = () => {
    if (signal.aborted || !isCurrent()) throw superseded();
  };
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  check();
  let token = sessionData.session?.access_token;
  if (sessionError || !token) throw sessionError ?? new Error('Authentication required');

  const invoke = (accessToken: string) =>
    supabase.functions.invoke<TokenRequest>('realtime-token', {
      body: { postIds },
      // Supplying the access token explicitly avoids relying on a Functions
      // client snapshot while Auth is rotating a session in the background.
      headers: { Authorization: `Bearer ${accessToken}` },
      signal,
    });

  let result = await invoke(token);
  check();
  if (responseStatus(result.error) !== 401) return result;

  // A rejected freshly-rotated JWT is safe to retry once after Auth refresh.
  // The token endpoint is read-only and does not create application state.
  const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
  check();
  if (refreshed.session?.user?.id !== sessionData.session?.user?.id) throw superseded();
  token = refreshed.session?.access_token;
  if (refreshError || !token) return result;
  result = await invoke(token);
  return result;
}

function grantedChannels(token: TokenRequest): Set<string> {
  try {
    const capability = JSON.parse(token.capability) as Record<string, unknown>;
    return new Set(Object.keys(capability).filter((name) => name.startsWith('post:')));
  } catch {
    return new Set();
  }
}

function waitForAuthorizationBatch(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, AUTHORIZATION_BATCH_MS);
  });
}

export function requestRealtimeToken(
  expectedClient: Realtime,
  requestedChannels: Set<string>,
  isCurrentClient: () => boolean,
  callback: (error: string | null, token: TokenRequest | null) => void,
): void {
  const lifetime = lifecycle.signal;
  const isCurrent = () => !lifetime.aborted && isCurrentClient();
  const run = async () => {
    const requestedSnapshot = new Set(requestedChannels);
    try {
      if (!isCurrent()) throw superseded();
      const controller = new AbortController();
      const postIds = [...requestedSnapshot].map((name) => name.slice('post:'.length));
      const { data, error } = await withTimeout(
        invokeRealtimeToken(postIds, controller.signal, isCurrent),
        AUTH_REQUEST_TIMEOUT_MS, controller, lifetime,
      );
      if (!isCurrent()) throw superseded();
      if (error || !data) throw error ?? new Error('Empty token response');
      lastRequestedChannels = requestedSnapshot;
      grantedPostChannels = grantedChannels(data);
      callback(null, data);
    } catch (error) {
      recordRealtimeFailure('token_request', error);
      callback(error instanceof Error ? error.message : 'Realtime authentication failed', null);
    }
  };
  tokenRequestTail = tokenRequestTail.then(run, run).then(() => undefined);
}

export async function ensurePostCapability(
  realtime: Realtime,
  channelName: string,
  isCurrentClient: () => boolean,
): Promise<void> {
  const lifetime = lifecycle.signal;
  const check = () => {
    if (lifetime.aborted || !isCurrentClient()) throw superseded();
  };
  while (!grantedPostChannels.has(channelName)) {
    check();
    let task = authorizationTask;
    if (!task || task.realtime !== realtime) {
      let promise: Promise<void>;
      promise = Promise.resolve()
        // FlatList mounts visible cards over several React effects. Give that
        // render pass one short window to collect every requested post channel
        // into a single provider token instead of authorizing once per card.
        .then(() => waitForAuthorizationBatch())
        .then(async () => {
          const remaining = authorizationRetryAt - Date.now();
          if (remaining > 0) {
            await new Promise((resolve) => {
              setTimeout(resolve, remaining);
            });
          }
        })
        .then(() => {
          check();
          return withTimeout(realtime.auth.authorize(), 35_000, new AbortController(), lifetime);
        })
        .then(() => {
          check();
          authorizationFailureCount = 0;
          authorizationRetryAt = 0;
        })
        .catch((error) => {
          check();
          authorizationFailureCount += 1;
          authorizationRetryAt = Date.now() + Math.min(
            5_000,
            500 * 2 ** Math.min(authorizationFailureCount - 1, 3),
          );
          throw error;
        })
        .finally(() => {
          if (authorizationTask?.promise === promise) authorizationTask = null;
        });
      task = { realtime, promise };
      authorizationTask = task;
    }
    await task.promise;
    check();
    if (!grantedPostChannels.has(channelName) && lastRequestedChannels.has(channelName)) {
      // Feed visibility can change between the authoritative read and channel
      // authorization (block, moderation, event rollover). This is an expected
      // access loss, not a transport outage and not a Sentry-worthy exception.
      throw new RealtimeAccessUnavailableError(channelName);
    }
  }
}

export function resetRealtimeAuthorization(): void {
  lifecycle.abort();
  lifecycle = new AbortController();
  grantedPostChannels = new Set();
  lastRequestedChannels = new Set();
  authorizationTask = null;
  tokenRequestTail = Promise.resolve();
  authorizationFailureCount = 0;
  authorizationRetryAt = 0;
}

export function resumeRealtimeAuthorization(realtime: Realtime, isCurrent: () => boolean): void {
  if (realtime.connection.state === 'connected') return;
  // Public authorize() supersedes suspended SDK token work without destroying
  // channel listeners, and reconnects disconnected/failed clients.
  resetRealtimeAuthorization();
  void realtime.auth.authorize().catch((error) => {
    if (isCurrent()) recordRealtimeFailure('foreground_authorization', error);
  });
}
