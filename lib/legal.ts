export const TERMS_VERSION = '2026-08-20';
export const PRIVACY_VERSION = '2026-08-20';

export function legalAcceptanceMetadata(acceptedAt: string) {
  return {
    terms_accepted_at: acceptedAt,
    terms_version: TERMS_VERSION,
    privacy_accepted_at: acceptedAt,
    privacy_version: PRIVACY_VERSION,
  };
}
