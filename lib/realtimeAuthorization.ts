import { type Realtime, type TokenRequest } from 'ably';
import { supabase } from './supabase';
import { recordRealtimeFailure } from './telemetry';

const AUTH_REQUEST_TIMEOUT_MS = 15_000;
let authorizationTask: { realtime: Realtime; promise: Promise<void> } | null = null;
let tokenRequestTail: Promise<void> = Promise.resolve();
let grantedPostChannels = new Set<string>();
let lastRequestedChannels = new Set<string>();

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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Realtime authentication timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function grantedChannels(token: TokenRequest): Set<string> {
  try {
    const capability = JSON.parse(token.capability) as Record<string, unknown>;
    return new Set(Object.keys(capability).filter((name) => name.startsWith('post:')));
  } catch {
    return new Set();
  }
}

export function requestRealtimeToken(
  expectedClient: Realtime,
  requestedChannels: Set<string>,
  isCurrentClient: () => boolean,
  callback: (error: string | null, token: TokenRequest | null) => void,
): void {
  const run = async () => {
    const requestedSnapshot = new Set(requestedChannels);
    try {
      const postIds = [...requestedSnapshot].map((name) => name.slice('post:'.length));
      const { data, error } = await withTimeout(
        supabase.functions.invoke<TokenRequest>('realtime-token', { body: { postIds } }),
        AUTH_REQUEST_TIMEOUT_MS,
      );
      if (error || !data) {
        recordRealtimeFailure('token_request', error ?? new Error('Empty token response'));
      }
      if (!error && data && isCurrentClient()) {
        lastRequestedChannels = requestedSnapshot;
        grantedPostChannels = grantedChannels(data);
      }
      callback(error?.message ?? null, data ?? null);
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
  while (!grantedPostChannels.has(channelName)) {
    let task = authorizationTask;
    if (!task || task.realtime !== realtime) {
      let promise: Promise<void>;
      promise = Promise.resolve()
        .then(() => realtime.auth.authorize())
        .then(() => undefined)
        .finally(() => {
          if (authorizationTask?.promise === promise) authorizationTask = null;
        });
      task = { realtime, promise };
      authorizationTask = task;
    }
    await task.promise;
    if (!isCurrentClient()) throw new Error('Realtime connection changed');
    if (!grantedPostChannels.has(channelName) && lastRequestedChannels.has(channelName)) {
      // Feed visibility can change between the authoritative read and channel
      // authorization (block, moderation, event rollover). This is an expected
      // access loss, not a transport outage and not a Sentry-worthy exception.
      throw new RealtimeAccessUnavailableError(channelName);
    }
  }
}

export function resetRealtimeAuthorization(): void {
  grantedPostChannels = new Set();
  lastRequestedChannels = new Set();
  authorizationTask = null;
  tokenRequestTail = Promise.resolve();
}
