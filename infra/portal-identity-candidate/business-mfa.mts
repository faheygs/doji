// Business-only TOTP step-up after verified hosted sign-in. No employee imports.
// Pending challenges/receipts must live only inside the encrypted durable session.
import { boundedBody } from './bounded-body.mts';
import { isRecord } from './business-contracts.mts';
import { isVerifiedBusinessActor, fail } from './business-http-state.mts';
import type { VerifiedBusinessActor } from './business-http-state.mts';
import type { PortalFetch } from './portal-contracts.mts';
interface Config {
  clientId: string;
  apiKey: string;
}
export interface BusinessMfaPending {
  subject: string;
  sessionId: string;
  factorId: string;
  challengeId: string;
  expires: number;
  enrollment: boolean;
}
export interface BusinessMfaReceipt {
  subject: string;
  sessionId: string;
  clientId: string;
  factorId: string;
  method: 'workos-totp-challenge';
  verifiedAt: number;
  expires: number;
}
const id = (value: unknown, prefix: string): value is string =>
  typeof value === 'string' && new RegExp(`^${prefix}_[A-Za-z0-9]{1,80}$`).test(value);
export function createBusinessMfa(config: Config, upstream: PortalFetch = fetch, now = Date.now) {
  const policy = { ...config };
  if (!id(policy.clientId, 'client') || !/^sk_[A-Za-z0-9_-]{20,}$/.test(policy.apiKey))
    throw fail(503);
  function actor(value: VerifiedBusinessActor) {
    if (
      !isVerifiedBusinessActor(value) ||
      value.audience !== policy.clientId ||
      value.expiresAtSeconds <= now() / 1000
    )
      throw fail();
  }
  async function request(path: string, signal: AbortSignal, body?: Record<string, unknown>) {
    const deadline = AbortSignal.any([signal, AbortSignal.timeout(4000)]);
    deadline.throwIfAborted();
    const response = await upstream('https://api.workos.com' + path, {
      method: body ? 'POST' : 'GET',
      redirect: 'error',
      signal: deadline,
      headers: { authorization: `Bearer ${policy.apiKey}`, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw fail(503);
    const result: unknown = JSON.parse(
      new TextDecoder().decode(await boundedBody(response.body, deadline, 32768)),
    );
    deadline.throwIfAborted();
    if (!isRecord(result)) throw fail(503);
    return result;
  }
  async function factors(value: VerifiedBusinessActor, signal: AbortSignal) {
    actor(value);
    const result = await request(`/user_management/users/${value.subject}/auth_factors`, signal);
    if (
      !Array.isArray(result.data) ||
      result.data.length > 10 ||
      result.data.some(
        (f: unknown) => !isRecord(f) || !id(f.id, 'auth_factor') || f.type !== 'totp',
      )
    )
      throw fail(503);
    const rows = result.data as { id: string; type: 'totp' }[];
    if (new Set(rows.map((f) => f.id)).size !== rows.length) throw fail(503);
    return rows;
  }
  function challenge(value: unknown, factorId: string) {
    if (
      !isRecord(value) ||
      !id(value.id, 'auth_challenge') ||
      value.authentication_factor_id !== factorId ||
      typeof value.expires_at !== 'string'
    )
      throw fail(503);
    const expires = Math.min(Date.parse(value.expires_at), now() + 300000);
    if (!Number.isSafeInteger(expires) || expires <= now()) throw fail(403);
    return { challengeId: value.id, expires };
  }
  return {
    async prepare(value: VerifiedBusinessActor, enroll: boolean, signal: AbortSignal) {
      const listed = await factors(value, signal);
      let factorId: string, pendingChallenge: unknown, secret: string | undefined;
      if (listed.length) {
        if (enroll) throw fail(409); // Never replace a factor or reset MFA here.
        factorId = listed[0]!.id;
        pendingChallenge = await request(`/auth/factors/${factorId}/challenge`, signal, {});
      } else {
        if (!enroll) return { enrollmentRequired: true as const };
        const result = await request(
          `/user_management/users/${value.subject}/auth_factors`,
          signal,
          { type: 'totp', totp_issuer: 'Doji Businesses', totp_user: value.subject },
        );
        const factor = result.authentication_factor;
        if (
          !isRecord(factor) ||
          !id(factor.id, 'auth_factor') ||
          factor.type !== 'totp' ||
          !isRecord(factor.totp) ||
          typeof factor.totp.secret !== 'string' ||
          !/^[A-Z2-7]{16,128}$/.test(factor.totp.secret)
        )
          throw fail(503);
        factorId = factor.id;
        secret = factor.totp.secret; // Returned only once to the bound enrollment UI; never stored.
        pendingChallenge = result.authentication_challenge;
      }
      actor(value);
      const pending: BusinessMfaPending = {
        subject: value.subject,
        sessionId: value.sessionId,
        factorId,
        enrollment: enroll,
        ...challenge(pendingChallenge, factorId),
      };
      return { pending, ...(secret ? { enrollmentSecret: secret } : {}) };
    },
    async complete(
      value: VerifiedBusinessActor,
      pending: unknown,
      code: unknown,
      signal: AbortSignal,
    ) {
      actor(value);
      if (
        !isRecord(pending) ||
        pending.subject !== value.subject ||
        pending.sessionId !== value.sessionId ||
        !id(pending.factorId, 'auth_factor') ||
        !id(pending.challengeId, 'auth_challenge') ||
        typeof pending.enrollment !== 'boolean' ||
        typeof pending.expires !== 'number' ||
        !Number.isSafeInteger(pending.expires) ||
        pending.expires <= now() ||
        pending.expires > now() + 300000 ||
        typeof code !== 'string' ||
        !/^\d{6}$/.test(code)
      )
        throw fail(403);
      // WorkOS does not list a newly enrolled factor until its first verification.
      // That factor/challenge pair came from enrollment for this exact subject
      // and is bound inside sealed session state, never accepted from the browser.
      if (
        !pending.enrollment &&
        !(await factors(value, signal)).some((f) => f.id === pending.factorId)
      )
        throw fail(403);
      const result = await request(`/auth/challenges/${pending.challengeId}/verify`, signal, {
        code,
      });
      // A rejected code is not a revoked identity. Keep the business session so
      // the user can deliberately obtain another one-use challenge.
      if (result.valid === false) throw fail(400);
      if (
        result.valid !== true ||
        !isRecord(result.challenge) ||
        result.challenge.id !== pending.challengeId ||
        result.challenge.authentication_factor_id !== pending.factorId
      )
        throw fail(403);
      challenge(result.challenge, pending.factorId);
      if (!(await factors(value, signal)).some((f) => f.id === pending.factorId)) throw fail(403);
      actor(value);
      if (pending.expires <= now()) throw fail(403);
      const receipt: BusinessMfaReceipt = {
        subject: value.subject,
        sessionId: value.sessionId,
        clientId: policy.clientId,
        factorId: pending.factorId,
        method: 'workos-totp-challenge',
        verifiedAt: now(),
        expires: now() + 8 * 3600000,
      };
      return receipt;
    },
    attest(value: VerifiedBusinessActor, receipt: unknown): VerifiedBusinessActor {
      actor(value);
      const valid =
        isRecord(receipt) &&
        receipt.subject === value.subject &&
        receipt.sessionId === value.sessionId &&
        receipt.clientId === policy.clientId &&
        id(receipt.factorId, 'auth_factor') &&
        receipt.method === 'workos-totp-challenge' &&
        typeof receipt.verifiedAt === 'number' &&
        Number.isSafeInteger(receipt.verifiedAt) &&
        receipt.verifiedAt <= now() &&
        typeof receipt.expires === 'number' &&
        Number.isSafeInteger(receipt.expires) &&
        receipt.expires > now() &&
        receipt.expires > receipt.verifiedAt &&
        receipt.expires <= receipt.verifiedAt + 8 * 3600000;
      return {
        ...value,
        mfaVerified: valid === true,
        expiresAtSeconds:
          valid && isRecord(receipt) && typeof receipt.expires === 'number'
            ? Math.min(value.expiresAtSeconds, receipt.expires / 1000)
            : value.expiresAtSeconds,
      };
    },
  };
}
