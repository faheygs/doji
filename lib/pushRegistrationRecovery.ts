import * as Sentry from '@sentry/react-native';
import { diagnosticSessionIsCurrent, mobileDiagnosticSnapshot } from './mobileDiagnosticContext';
import { mobileReleaseIdentity } from './releaseIdentity';

const MESSAGE = 'Doji push registration recovered';
const commands = new Set(['register_native_push_endpoint', 'register_native_push_endpoint_v2', 'register_native_push_endpoint_v3']);
const eventId = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{32}$/.test(value);
const diagnosticId = (value: unknown): value is string => typeof value === 'string' && /^diag:[a-z0-9:-]{10,170}$/.test(value);
const HOUR = 3_600_000;
let pending: { event: string; session: string; at: number } | undefined;
let sentAt: number[] = [];

/** Track only an incident handed to Sentry, never raw errors or member IDs. */
export function notePushRegistrationIncident(operation: string, id: unknown, session: unknown): void {
  try {
    if (!commands.has(operation) || !eventId(id) || !diagnosticId(session) || !diagnosticSessionIsCurrent(session)) return;
    if (pending?.session === session && Date.now() - pending.at < 24 * HOUR) return;
    pending = { event: id, session, at: Date.now() };
  } catch { /* Diagnostics cannot affect a command. */ }
}

/** A cached old receipt cannot establish recovery from a newer reported failure. */
export function hasPendingPushRegistrationIncident(): boolean {
  if (pending && (!diagnosticSessionIsCurrent(pending.session) || Date.now() - pending.at >= 24 * HOUR)) pending = undefined;
  return !!pending;
}

/** Only after a current-account server acknowledgement, never cancellation/cache hit. */
export function reportPushRegistrationRecovery(): void {
  try {
    if (!hasPendingPushRegistrationIncident() || !pending) return;
    const incident = pending;
    pending = undefined;
    if (__DEV__) return;
    const now = Date.now();
    sentAt = sentAt.filter(at => now - at < HOUR);
    if (sentAt.length >= 3) return;
    sentAt.push(now);
    const runtime = mobileDiagnosticSnapshot();
    const release = mobileReleaseIdentity();
    Sentry.logger.info(MESSAGE, {
      operation: 'push_registration', outcome: 'recovered', failure_event_id: incident.event,
      diagnostic_session: incident.session,
      ...(diagnosticId(runtime.installation_id) ? { diagnostic_installation: runtime.installation_id } : {}),
      recovery_elapsed_ms: Math.min(24 * HOUR, Math.max(0, now - incident.at)),
      platform: release.platform, app_version: release.appVersion ?? 'unknown',
      native_build: release.nativeBuildNumber ?? 'unknown', acknowledgement: 'server_confirmed',
    });
  } catch { /* Logging never changes successful registration. */ }
}

type BeforeLog = NonNullable<NonNullable<Parameters<typeof Sentry.init>[0]>['beforeSendLog']>;
/** Fail closed: no console/native logs, ambient user attributes, URLs or tokens. */
export const sanitizePushRecoveryLog: BeforeLog = log => {
  // This SDK serializes scope attributes AFTER beforeSendLog. Refuse a record
  // if ambient attributes exist instead of letting them bypass our whitelist.
  try {
    if ([Sentry.getCurrentScope(), Sentry.getIsolationScope(), Sentry.getGlobalScope()]
      .some(scope => Object.keys(scope.getScopeData().attributes ?? {}).length > 0)) return null;
  } catch { return null; }
  if (log.level !== 'info' || log.message !== MESSAGE) return null;
  const source = log.attributes ?? {};
  if (source.operation !== 'push_registration' || source.outcome !== 'recovered' ||
      source.acknowledgement !== 'server_confirmed' || !eventId(source.failure_event_id) ||
      !diagnosticId(source.diagnostic_session)) return null;
  const attributes: Record<string, string | number> = {
    operation: 'push_registration', outcome: 'recovered', acknowledgement: 'server_confirmed',
    failure_event_id: source.failure_event_id, diagnostic_session: source.diagnostic_session,
  };
  if (diagnosticId(source.diagnostic_installation)) attributes.diagnostic_installation = source.diagnostic_installation;
  if (source.platform === 'ios' || source.platform === 'android') attributes.platform = source.platform;
  for (const key of ['app_version', 'native_build']) {
    const value = source[key];
    if (typeof value === 'string' && /^[0-9.]{1,24}$/.test(value)) attributes[key] = value;
  }
  if (typeof source.recovery_elapsed_ms === 'number' && Number.isFinite(source.recovery_elapsed_ms)) {
    attributes.recovery_elapsed_ms = Math.min(24 * HOUR, Math.max(0, Math.round(source.recovery_elapsed_ms)));
  }
  return { level: 'info', message: MESSAGE, attributes };
};
