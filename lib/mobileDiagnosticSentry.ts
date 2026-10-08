import * as Sentry from '@sentry/react-native';
import { mobileDiagnosticSnapshot, setDiagnosticActor as setActor } from './mobileDiagnosticContext';

/** Infrequent scope sync lets SDK-native reports correlate too; no account ID is sent. */
export function syncMobileDiagnosticTags(): void {
  try {
    const context = mobileDiagnosticSnapshot();
    if (context.installation_id) Sentry.setTag('diagnostic_installation', String(context.installation_id));
    if (context.session_id) Sentry.setTag('diagnostic_session', String(context.session_id));
  } catch { /* Diagnostics cannot break auth or startup, even if the SDK is unavailable. */ }
}
export function setDiagnosticActor(actor: string | null): void {
  setActor(actor);
  syncMobileDiagnosticTags();
}
