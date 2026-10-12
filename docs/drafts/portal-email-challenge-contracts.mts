// LOCAL PREPARATION ONLY. Not a live route, session grant, or MFA-equivalent proof.
export type EmailAttempt = Readonly<{
  realm: 'employee' | 'business';
  origin: string;
  issuer: string;
  audience: string;
  subject: string;
  attemptId: string;
  browserHash: string;
  verifiedEmailHash: string;
  passwordVerifiedAtMs: number;
}>;
export type EmailChallenge = {
  id: string;
  requestId: string;
  binding: string;
  codeMac: string;
  expiresAtMs: number;
  deliveredToProvider: boolean;
  consumed: boolean;
};
export type EmailState = {
  windowAtMs: number;
  lastIssuedAtMs: number;
  sends: number;
  attempts: number;
  challenge: EmailChallenge | null;
};
/** Must serialize/commit atomically per actor across processes, not just in one browser.
 * No network email calls while the transaction is held. A durable implementation is gated.
 */
export interface EmailChallengeStore {
  transact<T>(
    key: string,
    reduce: (state: EmailState | null) => { state: EmailState; result: T },
  ): Promise<T>;
}
export type EmailObservation = Readonly<{
  method: 'email-code';
  purpose: 'portal-email-step-up';
  realm: EmailAttempt['realm'];
  subject: string;
  audience: string;
  issuer: string;
  attemptId: string;
  browserHash: string;
  verifiedEmailHash: string;
  verifiedAtMs: number;
  expiresAtMs: number;
}>;
export const EMAIL_DRAFT_POLICY = Object.freeze({
  challengeMs: 300_000,
  firstFactorMs: 300_000,
  windowMs: 900_000,
  resendMs: 60_000,
  sendsPerWindow: 3,
  attemptsPerWindow: 5,
});
export function assertEmailAttempt(value: EmailAttempt, now: number) {
  if (
    !value ||
    !Number.isSafeInteger(now) ||
    now < 0 ||
    !['employee', 'business'].includes(value.realm) ||
    value.origin !==
      (value.realm === 'employee' ? 'https://admin.dojipro.com' : 'https://business.dojipro.com') ||
    !/^client_[A-Za-z0-9]{1,80}$/.test(value.audience) ||
    value.issuer !== `https://api.workos.com/user_management/${value.audience}` ||
    !/^user_[A-Za-z0-9]{1,80}$/.test(value.subject) ||
    !/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value.attemptId) ||
    !/^[a-f\d]{64}$/.test(value.browserHash) ||
    !/^[a-f\d]{64}$/.test(value.verifiedEmailHash) ||
    !Number.isSafeInteger(value.passwordVerifiedAtMs) ||
    value.passwordVerifiedAtMs > now ||
    now - value.passwordVerifiedAtMs >= EMAIL_DRAFT_POLICY.firstFactorMs
  )
    throw Error('Portal email verification unavailable.');
}
