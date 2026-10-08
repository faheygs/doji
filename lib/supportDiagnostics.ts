import { mobileDiagnosticSnapshot } from './mobileDiagnosticContext';
import { mobileReleaseIdentity } from './releaseIdentity';
import { SUPPORT_EMAIL } from './legalDocuments';

const reference = (value: unknown): string => typeof value === 'string' && /^diag:[a-z0-9:-]{10,170}$/.test(value)
  ? value : 'Unavailable';
const version = (value: unknown): string => typeof value === 'string' && /^[0-9.]{1,24}$/.test(value)
  ? value : 'Unknown';

/** User-visible opt-in support text, not an automatic telemetry event or account lookup. */
export function supportDiagnosticDetails(): string {
  const release = mobileReleaseIdentity();
  const snapshot = mobileDiagnosticSnapshot();
  return [
    `Doji version: ${version(release.appVersion)}`,
    `Build: ${version(release.nativeBuildNumber)}`,
    `Platform: ${['ios', 'android', 'web'].includes(release.platform) ? release.platform : 'Unknown'}`,
    `Diagnostic installation: ${reference(snapshot.installation_id)}`,
    `Diagnostic session: ${reference(snapshot.session_id)}`,
  ].join('\n');
}

/** Opens a draft in the user's mail app; the user still chooses whether to send. */
export function supportEmailUrl(details: string): string {
  const body = `What happened?\n\nWhen did it happen (including time zone)?\n\nWhat did you expect?\n\nDiagnostic details:\n${details}`;
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Doji app problem')}&body=${encodeURIComponent(body)}`;
}
