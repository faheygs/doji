import type { Database } from '../types/database';
import type { AuthenticatedCommandName } from '../contracts/authenticatedCommands';
import { reportApiFailure } from './apiFailureTelemetry';
import { supabase } from './supabase';
import { mobileReleaseIdentity } from './releaseIdentity';
import { Platform } from 'react-native';
import { beginReadDiagnostics, finishReadDiagnostics, inheritReadDiagnostics, observedMemberFetch } from './memberReadDiagnostics';

const COMMAND_TIMEOUT_MS = 12_000;
const TRANSIENT_RETRY_DELAY_MS = 250;
const IDEMPOTENT_WITHOUT_COMMAND_KEY = new Set<string>([
  'clear_notification_history',
  'dismiss_notification',
  'mark_notification_center_opened',
  'mark_notification_attention_seen',
  'mark_moderation_notice_read',
  'purchase_shop_item',
  'register_native_push_endpoint',
  'register_native_push_endpoint_v2',
  'register_native_push_endpoint_v3',
  'sync_notification_center_state',
  'unregister_push_installation',
]);

type Functions = Database['public']['Functions'];
type FunctionName = keyof Functions & string;
type FunctionArgs<Name extends FunctionName> = Functions[Name]['Args'];
type FunctionResult<Name extends FunctionName> = Functions[Name]['Returns'];

export type CommandError = {
  status?: number;
  code: string;
  details: string | null;
  hint: string | null;
  message: string;
};

export type CommandResult<Name extends FunctionName> = {
  data: FunctionResult<Name> | null;
  error: CommandError | null;
};

function gatewayUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL?.trim().replace(/\/$/, '');
  return configured || null;
}

function commandError(value: unknown, fallback: string, status?: number): CommandError {
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const error = {
    status,
    code: typeof body.code === 'string' ? body.code : 'DOJI_COMMAND_ERROR',
    details: typeof body.details === 'string' ? body.details : null,
    hint: typeof body.hint === 'string' ? body.hint : null,
    message: typeof body.message === 'string' ? body.message : fallback,
  };
  if (Platform.OS === 'android') inheritReadDiagnostics(value, error);
  return error;
}

function mayRetryCommand(name: string, args: unknown): boolean {
  if (IDEMPOTENT_WITHOUT_COMMAND_KEY.has(name)) return true;
  if (!args || typeof args !== 'object') return false;
  return typeof (args as Record<string, unknown>).p_idempotency_key === 'string';
}

function isTransientStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function gatewayCommand<Name extends FunctionName>(
  baseUrl: string,
  token: string,
  name: Name,
  args: FunctionArgs<Name>,
): Promise<{ response: Response; payload: unknown }> {
  const release = mobileReleaseIdentity();
  const controller = new AbortController();
  const diagnose = Platform.OS === 'android';
  if (diagnose) beginReadDiagnostics(controller.signal, 'command_gateway');
  const timeout = setTimeout(() => controller.abort(new Error('Command timed out')), COMMAND_TIMEOUT_MS);
  try {
    const response = await (diagnose ? observedMemberFetch : fetch)(`${baseUrl}/commands/rpc/${name}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-client-info': 'doji-mobile/1.0',
        ...(release.appVersion ? { 'x-doji-app-version': release.appVersion } : {}),
        ...(release.nativeBuildNumber ? { 'x-doji-native-build': release.nativeBuildNumber } : {}),
        'x-doji-platform': release.platform,
        'x-doji-release-channel': release.releaseChannel,
      },
      body: JSON.stringify(args ?? {}),
      signal: controller.signal,
    });
    const text = await response.text();
    let payload: unknown = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { message: text };
      }
    }
    if (diagnose) finishReadDiagnostics(controller.signal, response,
      { abort_source: 'none', deadline_ms: COMMAND_TIMEOUT_MS });
    return { response, payload };
  } catch (error) {
    // Native fetch may reject with a generic AbortError instead of the deadline reason.
    const failure = controller.signal.aborted ? controller.signal.reason ?? new Error('Command timed out') : error;
    if (diagnose) finishReadDiagnostics(controller.signal,
      failure && typeof failure === 'object' ? failure : undefined,
      { abort_source: controller.signal.aborted ? 'deadline' : 'none', deadline_ms: COMMAND_TIMEOUT_MS });
    throw failure;
  } finally {
    clearTimeout(timeout);
    if (diagnose) finishReadDiagnostics(controller.signal);
  }
}

async function directCommand<Name extends FunctionName>(
  name: Name,
  args: FunctionArgs<Name>,
): Promise<CommandResult<Name>> {
  return supabase.rpc(name, args as never) as unknown as Promise<CommandResult<Name>>;
}

/**
 * Executes an authenticated atomic RPC and immediately wakes the realtime relay.
 * Direct PostgREST remains available in local environments without a gateway;
 * production builds require the gateway URL.
 */
export async function executeCommand<Name extends FunctionName & AuthenticatedCommandName>(
  name: Name,
  args: FunctionArgs<Name>,
  account?: { expectedUserId: string; isCurrent: () => boolean },
): Promise<CommandResult<Name>> {
  const accountChanged = (): CommandResult<Name> => ({ data: null,
    error: commandError(null, 'The account changed before this request finished.', 401) });
  if (account && !account.isCurrent()) return accountChanged();
  const baseUrl = gatewayUrl();
  if (!baseUrl) {
    if (__DEV__ && !account) return directCommand(name, args);
    if (!__DEV__) return {
      data: null,
      error: commandError(null, 'This build is missing its secure command service configuration.'),
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (account && (!account.isCurrent() || sessionData.session?.user?.id !== account.expectedUserId)) return accountChanged();
  let token = sessionData.session?.access_token;
  if (sessionError || !token) {
    return {
      data: null,
      error: commandError(sessionError, 'Authentication required'),
    };
  }
  if (!baseUrl) {
    // Pin local development RPCs to the same actor as production commands.
    return supabase.rpc(name, args as never).setHeader('Authorization', `Bearer ${token}`) as unknown as Promise<CommandResult<Name>>;
  }

  const retryable = mayRetryCommand(name, args);
  let transientRetriesRemaining = retryable ? 1 : 0;
  let refreshedUnauthorizedSession = false;
  let lastFailure: unknown = null;
  for (;;) {
    if (account && !account.isCurrent()) return accountChanged();
    try {
      const { response, payload } = await gatewayCommand(baseUrl, token, name, args);
      if (response.ok) {
        return { data: payload as FunctionResult<Name>, error: null };
      }

      if (response.status === 401 && !refreshedUnauthorizedSession) {
        if (account && !account.isCurrent()) return accountChanged();
        refreshedUnauthorizedSession = true;
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (account && (!account.isCurrent() || refreshed.session?.user?.id !== account.expectedUserId)) return accountChanged();
        const refreshedToken = refreshed.session?.access_token;
        if (!refreshError && refreshedToken) {
          token = refreshedToken;
          continue;
        }
      }

      if (transientRetriesRemaining > 0 && isTransientStatus(response.status)) {
        transientRetriesRemaining -= 1;
        lastFailure = commandError(payload, `Command failed (${response.status})`, response.status);
        await delay(TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      const error = commandError(payload, `Command failed (${response.status})`, response.status);
      if (Platform.OS === 'android') inheritReadDiagnostics(response, error);
      reportApiFailure('command', name, error);
      return {
        data: null,
        error,
      };
    } catch (error) {
      lastFailure = error;
      if (transientRetriesRemaining > 0) {
        transientRetriesRemaining -= 1;
        await delay(TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }

  const error = commandError(lastFailure, 'Doji could not finish that request. Please try again.');
  reportApiFailure('command', name, error);
  return {
    data: null,
    error,
  };
}
