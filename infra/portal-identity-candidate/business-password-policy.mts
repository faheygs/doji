// Public business-only presentation contract. No credentials or server dependencies.
// Verified against the business WorkOS policy on 2026-10-11: minimum 10,
// strength 3, no required character classes. Reverify when changing provider policy.
// WorkOS remains authoritative for strength; length alone never promises acceptance.
export const businessPasswordMinimum = 10;
export const businessPasswordMaximum = 256;

export const businessPasswordMessages = {
  password_too_short: 'Use at least 10 characters for your password.',
  password_too_long: 'Use no more than 256 characters for your password.',
  password_contains_email: 'Your password must not contain your email address.',
  password_requirements: 'Try a less predictable password, or add another word to your passphrase.',
} as const;
export type BusinessPasswordIssue = keyof typeof businessPasswordMessages;
export function isBusinessPasswordIssue(value: unknown): value is BusinessPasswordIssue {
  return typeof value === 'string' && Object.hasOwn(businessPasswordMessages, value);
}
export function businessPasswordIssue(
  password: string,
  email?: string,
): BusinessPasswordIssue | null {
  if (password.length < businessPasswordMinimum) return 'password_too_short';
  if (password.length > businessPasswordMaximum) return 'password_too_long';
  if (email && password.toLowerCase().includes(email.trim().toLowerCase()))
    return 'password_contains_email';
  return null;
}
export class BusinessPasswordRejected extends Error {
  readonly code: BusinessPasswordIssue;
  constructor(code: BusinessPasswordIssue) {
    super(businessPasswordMessages[code]);
    this.code = code;
  }
}
