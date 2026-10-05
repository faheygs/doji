// Server-only sealed state. Decryption is not a substitute for validating its shape.
import {
  randomBytes,
  createHash,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from 'node:crypto';
import { isRecord } from './business-contracts.mts';
import type { BusinessActor, BusinessAgreement } from './business-contracts.mts';
import type { BusinessTokens } from './workos-business-provider.mts';

export interface VerifiedBusinessActor extends BusinessActor {
  expiresAtSeconds: number;
}
export interface LoginFlow {
  binding: string;
  verifier: string;
  agreements: BusinessAgreement | null;
  expires: number;
}
export interface SavedSession {
  tokens: BusinessTokens;
  actor: VerifiedBusinessActor;
  csrf: string;
  created: number;
  touched: number;
}
export const random = () => randomBytes(32).toString('base64url');
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const opaque = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value);
export const fail = (status = 401) =>
  Object.assign(Error('Business access could not be verified. Please sign in again.'), { status });
export function equal(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const left = Buffer.from(a),
    right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function isVerifiedBusinessActor(value: unknown): value is VerifiedBusinessActor {
  return (
    isRecord(value) &&
    value.realm === 'business' &&
    typeof value.subject === 'string' &&
    /^user_[A-Za-z0-9]+$/.test(value.subject) &&
    typeof value.sessionId === 'string' &&
    /^session_[A-Za-z0-9]+$/.test(value.sessionId) &&
    typeof value.audience === 'string' &&
    /^client_[A-Za-z0-9]+$/.test(value.audience) &&
    value.issuer === `https://api.workos.com/user_management/${value.audience}` &&
    typeof value.mfaVerified === 'boolean' &&
    finite(value.expiresAtSeconds)
  );
}
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
function isTokens(value: unknown): value is BusinessTokens {
  return (
    isRecord(value) &&
    typeof value.subject === 'string' &&
    typeof value.accessToken === 'string' &&
    typeof value.refreshToken === 'string'
  );
}
function isAgreement(value: unknown): value is BusinessAgreement {
  return (
    isRecord(value) &&
    value.termsAccepted === true &&
    value.privacyAcknowledged === true &&
    value.country === 'US' &&
    typeof value.termsVersion === 'string' &&
    typeof value.privacyVersion === 'string'
  );
}
export function loginFlow(value: unknown): LoginFlow {
  if (
    !isRecord(value) ||
    typeof value.binding !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.binding) ||
    !opaque(value.verifier) ||
    !finite(value.expires) ||
    !(value.agreements === null || isAgreement(value.agreements))
  )
    throw fail();
  return {
    binding: value.binding,
    verifier: value.verifier,
    expires: value.expires,
    agreements: value.agreements,
  };
}
export function savedSession(value: unknown): SavedSession {
  if (
    !isRecord(value) ||
    !isTokens(value.tokens) ||
    !isVerifiedBusinessActor(value.actor) ||
    !opaque(value.csrf) ||
    !finite(value.created) ||
    !finite(value.touched)
  )
    throw fail();
  return {
    tokens: value.tokens,
    actor: value.actor,
    csrf: value.csrf,
    created: value.created,
    touched: value.touched,
  };
}
export function createBusinessCipher(origin: string, clientId: string, encryptionKey: string) {
  const key = Buffer.from(encryptionKey, 'hex');
  const aad = Buffer.from(`doji-business-v1|${origin}|${clientId}`);
  return {
    seal(data: LoginFlow | SavedSession): string {
      const iv = randomBytes(12),
        cipher = createCipheriv('aes-256-gcm', key, iv);
      cipher.setAAD(aad);
      const text = Buffer.concat([cipher.update(JSON.stringify(data), 'utf8'), cipher.final()]);
      return Buffer.concat([iv, cipher.getAuthTag(), text]).toString('base64url');
    },
    open(text: string): unknown {
      if (typeof text !== 'string' || text.length > 50000) throw fail();
      const bytes = Buffer.from(text, 'base64url'),
        decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAAD(aad);
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'),
      );
    },
  };
}
