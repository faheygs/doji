// Shared browser/server business contracts. Network and SQL values remain unknown
// until runtime validation; TypeScript is not an authorization boundary.
export type BusinessState = 'draft' | 'pending' | 'changes_requested' | 'approved' | 'declined';
export interface BusinessApplication {
  id: string;
  revision: number;
  state: BusinessState;
  details: Record<string, unknown>;
}
export interface BusinessSession {
  csrf: string;
  assurance: 'aal1' | 'aal2';
}
export interface BusinessActor {
  realm: 'business';
  issuer: string;
  audience: string;
  subject: string;
  sessionId: string;
  mfaVerified: boolean;
}
export interface BusinessAgreement {
  termsAccepted: boolean;
  privacyAcknowledged: boolean;
  termsVersion: string;
  privacyVersion: string;
  country: string;
}
export interface BusinessCommand {
  p_action: 'save' | 'submit';
  p_revision: number | null;
  p_details: Record<string, unknown>;
  p_terms_version: string | null;
  p_privacy_version: string | null;
  p_request_id: string;
}
export const businessStates: readonly BusinessState[] = Object.freeze([
  'draft',
  'pending',
  'changes_requested',
  'approved',
  'declined',
]);
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
export function errorStatus(value: unknown): number | undefined {
  return isRecord(value) && typeof value.status === 'number' ? value.status : undefined;
}
export function isBusinessApplication(value: unknown): value is BusinessApplication {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.revision === 'number' &&
    Number.isSafeInteger(value.revision) &&
    value.revision > 0 &&
    businessStates.some((state) => state === value.state) &&
    isRecord(value.details)
  );
}
