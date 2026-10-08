import type { Database } from '../types/database';
import { Platform } from 'react-native';
import { mobileReleaseIdentity } from './releaseIdentity';
import { beginReadDiagnostics, finishReadDiagnostics, inheritReadDiagnostics, observedMemberFetch } from './memberReadDiagnostics';
import { abortRegistration, awaitRegistration, checkRegistrationSignal, PushRegistrationInterrupted, registrationAbortReason } from './pushRegistrationCancellation';

const COMMAND_TIMEOUT_MS = 12_000;
type Functions = Database['public']['Functions'];
type FunctionName = keyof Functions & string;
type FunctionArgs<Name extends FunctionName> = Functions[Name]['Args'];

export type CommandError = {
  status?: number;
  code: string;
  details: string | null;
  hint: string | null;
  message: string;
};

export function commandError(value: unknown, fallback: string, status?: number): CommandError {
  const body = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const error = {
    status: status ?? (typeof body.status === 'number' ? body.status : undefined),
    code: typeof body.code === 'string' ? body.code : 'DOJI_COMMAND_ERROR',
    details: typeof body.details === 'string' ? body.details : null,
    hint: typeof body.hint === 'string' ? body.hint : null,
    message: typeof body.message === 'string' ? body.message : fallback,
  };
  if (Platform.OS === 'android' || Platform.OS === 'ios') inheritReadDiagnostics(value, error);
  return error;
}

export async function gatewayCommand<Name extends FunctionName>(
  baseUrl: string,
  token: string,
  name: Name,
  args: FunctionArgs<Name>,
  parent?: AbortSignal,
): Promise<{ response: Response; payload: unknown }> {
  const release = mobileReleaseIdentity();
  const controller = new AbortController();
  checkRegistrationSignal(parent);
  let abortSource: 'none' | 'parent' | 'deadline' = 'none';
  const abort = (source: 'parent' | 'deadline', reason: unknown) => {
    if (controller.signal.aborted) return;
    abortSource = source;
    abortRegistration(controller, reason);
  };
  const fromParent = () => abort('parent', parent ? registrationAbortReason(parent) : new PushRegistrationInterrupted('superseded'));
  parent?.addEventListener('abort', fromParent, { once: true });
  const diagnose = Platform.OS === 'android' || Platform.OS === 'ios';
  if (diagnose) beginReadDiagnostics(controller.signal, 'command_gateway');
  const timeout = setTimeout(() => abort('deadline', new Error('Command timed out')), COMMAND_TIMEOUT_MS);
  let received: Response | undefined;
  try {
    const work = (diagnose ? observedMemberFetch : fetch)(`${baseUrl}/commands/rpc/${name}`, {
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
    // Only registration opts in. Other commands retain their existing transport behavior.
    const response = received = await (parent ? awaitRegistration(work, controller.signal) : work);
    const body = response.text();
    const text = await (parent ? awaitRegistration(body, controller.signal) : body);
    if (parent) checkRegistrationSignal(controller.signal);
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
    // A received HTTP rejection remains a real failure even if body reading is interrupted.
    const failure = parent && received && !received.ok
      ? commandError(null, `Command failed (${received.status})`, received.status)
      : controller.signal.aborted ? registrationAbortReason(controller.signal) : error;
    if (diagnose) finishReadDiagnostics(controller.signal,
      failure && typeof failure === 'object' ? failure : undefined,
      { abort_source: abortSource, deadline_ms: COMMAND_TIMEOUT_MS });
    throw failure;
  } finally {
    clearTimeout(timeout);
    parent?.removeEventListener('abort', fromParent);
    if (diagnose) finishReadDiagnostics(controller.signal);
  }
}
