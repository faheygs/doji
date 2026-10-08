import type { Database } from '../types/database';
import type { AuthenticatedCommandName } from '../contracts/authenticatedCommands';
import { apiAttemptDetails, reportApiFailure } from './apiFailureTelemetry';
import { diagnosticSessionIsCurrent, mobileDiagnosticSnapshot, recordDiagnosticOutcome } from './mobileDiagnosticContext';
import { supabase } from './supabase';
import { Platform } from 'react-native';
import { inheritReadDiagnostics } from './memberReadDiagnostics';
import { commandError, gatewayCommand, type CommandError } from './commandGatewayTransport';
import { awaitRegistration, isPushRegistrationInterrupted, PushRegistrationInterrupted, registrationDelay } from './pushRegistrationCancellation';

const TRANSIENT_RETRY_DELAY_MS = 250;
const REGISTRATION_COMMANDS = new Set<string>(['register_native_push_endpoint', 'register_native_push_endpoint_v2', 'register_native_push_endpoint_v3']);
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

export type { CommandError } from './commandGatewayTransport';

export type CommandResult<Name extends FunctionName> = {
  data: FunctionResult<Name> | null;
  error: CommandError | null;
};

function gatewayUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_COMMAND_GATEWAY_URL?.trim().replace(/\/$/, '');
  return configured || null;
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

async function directCommand<Name extends FunctionName>(
  name: Name,
  args: FunctionArgs<Name>,
): Promise<CommandResult<Name>> {
  return supabase.rpc(name, args as never) as unknown as Promise<CommandResult<Name>>;
}

/**
 * Executes an authenticated atomic RPC and wakes the realtime relay.
 * Direct PostgREST remains available in local environments without a gateway;
 * Production requires the gateway URL.
 */
export async function executeCommand<Name extends FunctionName & AuthenticatedCommandName>(
  name: Name,
  args: FunctionArgs<Name>,
  account?: { expectedUserId: string; isCurrent: () => boolean; registrationSignal?: AbortSignal },
): Promise<CommandResult<Name>> {
  const signal = REGISTRATION_COMMANDS.has(name) ? account?.registrationSignal : undefined;
  const interrupted = (): CommandResult<Name> => ({ data: null,
    error: commandError(new PushRegistrationInterrupted('superseded'), 'Push registration interrupted.') });
  const accountChanged = (): CommandResult<Name> => ({ data: null,
    error: commandError(null, 'The account changed before this request finished.', 401) });
  if (signal?.aborted) return interrupted();
  if (account && !account.isCurrent()) return accountChanged();
  const baseUrl = gatewayUrl();
  if (!baseUrl) {
    if (__DEV__ && !account) return directCommand(name, args);
    if (!__DEV__) return {
      data: null,
      error: commandError(null, 'This build is missing its secure command service configuration.'),
    };
  }

  let session;
  try { session = await awaitRegistration(supabase.auth.getSession(), signal); }
  catch (error) { if (isPushRegistrationInterrupted(error)) return interrupted(); throw error; }
  const { data: sessionData, error: sessionError } = session;
  if (signal?.aborted) return interrupted();
  if (account && (!account.isCurrent() || sessionData.session?.user?.id !== account.expectedUserId)) return accountChanged();
  let token = sessionData.session?.access_token;
  if (sessionError || !token) {
    return {
      data: null,
      error: commandError(sessionError, 'Authentication required'),
    };
  }
  if (!baseUrl) {
    const query = supabase.rpc(name, args as never).setHeader('Authorization', `Bearer ${token}`);
    if (!signal) return query as unknown as Promise<CommandResult<Name>>;
    try {
      const result = await awaitRegistration(query.abortSignal(signal), signal);
      return signal.aborted ? interrupted() : result as unknown as CommandResult<Name>;
    } catch (error) { if (isPushRegistrationInterrupted(error)) return interrupted(); throw error; }
  }

  const retryable = mayRetryCommand(name, args);
  let transientRetriesRemaining = retryable ? 1 : 0;
  let refreshedUnauthorizedSession = false;
  let lastFailure: unknown = null;
  const diagnosticStarted = Date.now(), diagnosticSession = mobileDiagnosticSnapshot().session_id;
  let attempts = 0;
  let firstAttempt: ReturnType<typeof apiAttemptDetails> | undefined;
  const reportFailure = (error: CommandError) => reportApiFailure('command', name, error,
    Platform.OS === 'ios' || Platform.OS === 'android' ? {
      attempt_count: attempts, fetch_elapsed_ms: Math.min(120_000, Math.max(0, Date.now() - diagnosticStarted)),
      attempts: [...(firstAttempt ? [firstAttempt] : []), apiAttemptDetails(error)],
    } : undefined);
  for (;;) {
    if (signal?.aborted) {
      if (lastFailure) reportFailure(commandError(lastFailure, 'Command failed'));
      return interrupted();
    }
    if (account && !account.isCurrent()) return accountChanged();
    attempts += 1;
    try {
      const { response, payload } = await gatewayCommand(baseUrl, token, name, args, signal);
      if (response.ok) {
        if (signal?.aborted) return interrupted();
        if (signal && account && !account.isCurrent()) return accountChanged();
        if (diagnosticSessionIsCurrent(diagnosticSession)) recordDiagnosticOutcome(name, attempts > 1 ? 'recovered' : 'success', attempts);
        return { data: payload as FunctionResult<Name>, error: null };
      }
      const observedError = commandError(payload, `Command failed (${response.status})`, response.status);
      if (Platform.OS === 'android' || Platform.OS === 'ios') inheritReadDiagnostics(response, observedError);

      if (response.status === 401 && !refreshedUnauthorizedSession) {
        if (account && !account.isCurrent()) return accountChanged();
        refreshedUnauthorizedSession = true;
        const { data: refreshed, error: refreshError } = await awaitRegistration(supabase.auth.refreshSession(), signal);
        if (signal?.aborted) return interrupted();
        if (account && (!account.isCurrent() || refreshed.session?.user?.id !== account.expectedUserId)) return accountChanged();
        const refreshedToken = refreshed.session?.access_token;
        if (!refreshError && refreshedToken) {
          firstAttempt ??= apiAttemptDetails(observedError);
          token = refreshedToken;
          continue;
        }
      }

      if (transientRetriesRemaining > 0 && isTransientStatus(response.status)) {
        transientRetriesRemaining -= 1;
        lastFailure = observedError;
        firstAttempt ??= apiAttemptDetails(observedError);
        await (signal ? registrationDelay(TRANSIENT_RETRY_DELAY_MS, signal) : delay(TRANSIENT_RETRY_DELAY_MS));
        continue;
      }
      const error = observedError;
      reportFailure(error);
      return {
        data: null,
        error,
      };
    } catch (error) {
      if (isPushRegistrationInterrupted(error)) {
        if (lastFailure) reportFailure(commandError(lastFailure, 'Command failed'));
        return interrupted();
      }
      lastFailure = error;
      if (transientRetriesRemaining > 0) {
        firstAttempt ??= apiAttemptDetails(error);
        transientRetriesRemaining -= 1;
        try { await (signal ? registrationDelay(TRANSIENT_RETRY_DELAY_MS, signal) : delay(TRANSIENT_RETRY_DELAY_MS)); }
        catch (interruption) {
          if (!isPushRegistrationInterrupted(interruption)) throw interruption;
          reportFailure(commandError(lastFailure, 'Command failed'));
          return interrupted();
        }
        continue;
      }
      break;
    }
  }

  const error = commandError(lastFailure, 'Doji could not finish that request. Please try again.');
  reportFailure(error);
  return {
    data: null,
    error,
  };
}
