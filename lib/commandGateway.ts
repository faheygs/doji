import type { Database } from '../types/database';
import type { AuthenticatedCommandName } from '../contracts/authenticatedCommands';
import { reportRealtimeFailure } from './telemetry';
import { supabase } from './supabase';

const COMMAND_TIMEOUT_MS = 12_000;
const TRANSIENT_RETRY_DELAY_MS = 250;
const IDEMPOTENT_WITHOUT_COMMAND_KEY = new Set<string>([
  'clear_notification_history',
  'dismiss_notification',
  'mark_notification_center_opened',
  'purchase_shop_item',
  'register_native_push_endpoint',
  'sync_notification_center_state',
  'unregister_push_installation',
]);

type Functions = Database['public']['Functions'];
type FunctionName = keyof Functions & string;
type FunctionArgs<Name extends FunctionName> = Functions[Name]['Args'];
type FunctionResult<Name extends FunctionName> = Functions[Name]['Returns'];

export type CommandError = {
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

function commandError(value: unknown, fallback: string): CommandError {
  const body = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    code: typeof body.code === 'string' ? body.code : 'DOJI_COMMAND_ERROR',
    details: typeof body.details === 'string' ? body.details : null,
    hint: typeof body.hint === 'string' ? body.hint : null,
    message: typeof body.message === 'string' ? body.message : fallback,
  };
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
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/commands/rpc/${name}`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        'x-client-info': 'doji-mobile/1.0',
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
    return { response, payload };
  } finally {
    clearTimeout(timeout);
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
): Promise<CommandResult<Name>> {
  const baseUrl = gatewayUrl();
  if (!baseUrl) {
    if (__DEV__) return directCommand(name, args);
    return {
      data: null,
      error: commandError(
        null,
        'This build is missing its secure command service configuration.',
      ),
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) {
    return {
      data: null,
      error: commandError(sessionError, 'Authentication required'),
    };
  }

  const retryable = mayRetryCommand(name, args);
  let lastFailure: unknown = null;
  for (let attempt = 0; attempt < (retryable ? 2 : 1); attempt += 1) {
    try {
      const { response, payload } = await gatewayCommand(baseUrl, token, name, args);
      if (response.ok) {
        return { data: payload as FunctionResult<Name>, error: null };
      }
      if (attempt === 0 && retryable && isTransientStatus(response.status)) {
        lastFailure = commandError(payload, `Command failed (${response.status})`);
        await delay(TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
      return {
        data: null,
        error: commandError(payload, `Command failed (${response.status})`),
      };
    } catch (error) {
      lastFailure = error;
      if (attempt === 0 && retryable) {
        await delay(TRANSIENT_RETRY_DELAY_MS);
        continue;
      }
    }
  }

  reportRealtimeFailure('command-gateway', lastFailure, { command: name });
  return {
    data: null,
    error: commandError(lastFailure, 'Doji could not finish that request. Please try again.'),
  };
}
