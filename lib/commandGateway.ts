import type { Database } from '../types/database';
import { reportRealtimeFailure } from './telemetry';
import { supabase } from './supabase';

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
export async function executeCommand<Name extends FunctionName>(
  name: Name,
  args: FunctionArgs<Name>,
): Promise<CommandResult<Name>> {
  const baseUrl = gatewayUrl();
  if (!baseUrl) return directCommand(name, args);

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (sessionError || !token) {
    return {
      data: null,
      error: commandError(sessionError, 'Authentication required'),
    };
  }

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
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      return {
        data: null,
        error: commandError(payload, `Command failed (${response.status})`),
      };
    }
    return { data: payload as FunctionResult<Name>, error: null };
  } catch (error) {
    reportRealtimeFailure('command-gateway', error, { command: name });
    return {
      data: null,
      error: commandError(error, 'Unable to reach Doji. Please try again.'),
    };
  }
}

