// LOCAL PREPARATION ONLY. Not imported by the deployed runtime. Never browser code.
import { boundedBody } from './bounded-body.mts';
import { isRecord } from './business-contracts.mts';
import type { BusinessTokens } from './workos-business-provider.mts';
import { createHash } from 'node:crypto';
import { BusinessPasswordRejected } from './business-password-policy.mts';
import { ownedDiagnostic } from './business-owned-diagnostics.mts';
export interface OwnedResetMetadata {
  resetId: string;
  subject: string;
  tokenHash: string;
  expires: number;
}
export type OwnedGrant =
  | { kind: 'verified'; tokens: BusinessTokens }
  | { kind: 'email'; pendingToken: string }
  | { kind: 'mfa'; pendingToken: string; subject: string; challengeId: string; expires: number };
// Only an explicit negative code response permits another user-entered attempt.
// Timeouts, malformed responses, rate limits and unknown outcomes remain terminal.
export class OwnedCodeRejected extends Error {
  constructor() {
    super('The verification code was not accepted.');
  }
}
export interface OwnedProviderPolicy {
  enabled: boolean;
  sendingEnabled: boolean;
  customResetEmailEnabled?: boolean;
  realm: 'business';
  origin: string;
  clientId: string;
  apiKey: string;
}
const denied = () => Error('Business authentication could not be completed.');
const validEmail = (v: string) => v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const secret = (v: unknown): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= 8192;
export function createBusinessOwnedProvider(config: OwnedProviderPolicy, upstream: typeof fetch) {
  const policy = Object.freeze({ ...config });
  if (
    policy.realm !== 'business' ||
    policy.origin !== 'https://business.dojipro.com' ||
    !/^client_[A-Za-z0-9]+$/.test(policy.clientId) ||
    !/^sk_[A-Za-z0-9_-]{20,}$/.test(policy.apiKey)
  )
    throw denied();
  const gate = () => {
    if (policy.enabled !== true) throw denied();
  };
  const mailGate = () => {
    gate();
    if (policy.sendingEnabled !== true) throw denied();
  };
  async function post(path: string, body: Record<string, unknown>, signal: AbortSignal) {
    gate();
    signal.throwIfAborted();
    try {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(10000)]);
      const response = await upstream(`https://api.workos.com${path}`, {
        method: 'POST',
        redirect: 'error',
        signal: deadline,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${policy.apiKey}` },
        body: JSON.stringify(body),
      });
      const data: unknown = JSON.parse(
        new TextDecoder().decode(await boundedBody(response.body, deadline, 65536)),
      );
      deadline.throwIfAborted();
      if (!isRecord(data)) throw denied();
      return { status: response.status, data };
    } catch {
      throw denied();
    } // No raw provider response, credentials, email or tokens in errors.
  }
  async function authenticate(
    fields: Record<string, string>,
    signal: AbortSignal,
    codeAttempt = false,
  ): Promise<OwnedGrant> {
    // Password auth may itself send verification/Radar mail. Sending gate applies.
    mailGate();
    const { status, data } = await post(
      '/user_management/authenticate',
      { client_id: policy.clientId, client_secret: policy.apiKey, ...fields },
      signal,
    );
    if (data.impersonator || data.organization_id || data.oauth_tokens) throw denied();
    if (
      codeAttempt &&
      status === 401 &&
      !data.access_token &&
      !data.refresh_token &&
      !data.pending_authentication_token &&
      (typeof data.code === 'string' || typeof data.error === 'string')
    )
      throw new OwnedCodeRejected();
    if (
      [400, 403].includes(status) &&
      data.code === 'mfa_challenge' &&
      secret(data.pending_authentication_token) &&
      !data.access_token &&
      !data.refresh_token
    ) {
      if (
        !isRecord(data.user) ||
        data.user.email_verified !== true ||
        typeof data.user.id !== 'string' ||
        !/^user_[A-Za-z0-9]+$/.test(data.user.id) ||
        !Array.isArray(data.authentication_factors) ||
        data.authentication_factors.length < 1 ||
        data.authentication_factors.length > 10 ||
        !data.authentication_factors.every(
          (f: unknown) =>
            isRecord(f) &&
            f.type === 'totp' &&
            typeof f.id === 'string' &&
            /^auth_factor_[A-Za-z0-9]+$/.test(f.id),
        )
      )
        throw denied();
      const ids = data.authentication_factors.map((f: { id: string }) => f.id);
      if (new Set(ids).size !== ids.length) throw denied();
      const factorId = ids[0]!;
      const challenge = await post(`/auth/factors/${factorId}/challenge`, {}, signal);
      const expires =
        typeof challenge.data.expires_at === 'string' ? Date.parse(challenge.data.expires_at) : NaN;
      if (
        ![200, 201].includes(challenge.status) ||
        typeof challenge.data.id !== 'string' ||
        !/^auth_challenge_[A-Za-z0-9]+$/.test(challenge.data.id) ||
        challenge.data.authentication_factor_id !== factorId ||
        !Number.isSafeInteger(expires) ||
        expires <= Date.now()
      )
        throw denied();
      return {
        kind: 'mfa',
        subject: data.user.id,
        pendingToken: data.pending_authentication_token,
        challengeId: challenge.data.id,
        expires: Math.min(expires, Date.now() + 300000),
      };
    }
    if (
      [400, 403].includes(status) &&
      data.code === 'email_verification_required' &&
      secret(data.pending_authentication_token) &&
      !data.access_token &&
      !data.refresh_token
    )
      return { kind: 'email', pendingToken: data.pending_authentication_token };
    if (
      status !== 200 ||
      !isRecord(data.user) ||
      data.user.email_verified !== true ||
      typeof data.user.id !== 'string' ||
      !/^user_[A-Za-z0-9]+$/.test(data.user.id) ||
      !secret(data.access_token) ||
      !secret(data.refresh_token)
    )
      throw denied();
    // Cryptographic issuer/audience/session verification is still mandatory before use.
    return {
      kind: 'verified',
      tokens: {
        subject: data.user.id,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
      },
    };
  }
  return Object.freeze({
    async password(email: string, password: string, signal: AbortSignal) {
      if (!validEmail(email) || !password.length || password.length > 256) throw denied();
      return authenticate({ grant_type: 'password', email, password }, signal);
    },
    async create(email: string, password: string, signal: AbortSignal) {
      mailGate();
      if (!validEmail(email) || !password.length || password.length > 256) throw denied();
      const { status, data } = await post(
        '/user_management/users',
        { email, password, email_verified: false },
        signal,
      );
      // WorkOS OpenAPI: create-user 400/password_strength_error. Never match
      // human-readable messages or forward provider payloads to the browser/logs.
      if (
        status === 400 &&
        (data.code === 'password_strength_error' || data.code === 'password_contains_email') &&
        !data.id &&
        !data.user &&
        !data.access_token &&
        !data.refresh_token &&
        !data.pending_authentication_token
      ) {
        ownedDiagnostic('registration_password_rejected');
        throw new BusinessPasswordRejected(
          data.code === 'password_contains_email'
            ? 'password_contains_email'
            : 'password_requirements',
        );
      }
      if (
        ![200, 201].includes(status) ||
        typeof data.id !== 'string' ||
        !/^user_[A-Za-z0-9]+$/.test(data.id) ||
        data.email_verified !== false
      )
        throw denied();
      return data.id;
    },
    async verify(pendingToken: string, code: string, signal: AbortSignal) {
      if (!secret(pendingToken) || !/^\d{6}$/.test(code)) throw denied();
      return authenticate(
        {
          grant_type: 'urn:workos:oauth:grant-type:email-verification:code',
          pending_authentication_token: pendingToken,
          code,
        },
        signal,
        true,
      );
    },
    async mfa(pendingToken: string, challengeId: string, code: string, signal: AbortSignal) {
      if (
        !secret(pendingToken) ||
        !/^auth_challenge_[A-Za-z0-9]+$/.test(challengeId) ||
        !/^\d{6}$/.test(code)
      )
        throw denied();
      return authenticate(
        {
          grant_type: 'urn:workos:oauth:grant-type:mfa-totp',
          pending_authentication_token: pendingToken,
          authentication_challenge_id: challengeId,
          code,
        },
        signal,
        true,
      );
    },
    async recover(
      email: string,
      signal: AbortSignal,
      deliver?: (metadata: OwnedResetMetadata, token: string) => Promise<void>,
    ): Promise<OwnedResetMetadata | null> {
      mailGate();
      // No fallback to WorkOS's query-token email. Enabling this requires verified
      // default-mail suppression in the BUSINESS WorkOS environment only.
      if (!validEmail(email) || policy.customResetEmailEnabled !== true || !deliver) throw denied();
      const result = await post('/user_management/password_reset', { email }, signal);
      // Keep only server metadata needed for exact link/subject binding. Never
      // retain the raw token, URL, email or full provider response.
      if (result.status === 404) return null;
      const { data } = result;
      const expires = typeof data.expires_at === 'string' ? Date.parse(data.expires_at) : NaN;
      if (
        ![200, 201].includes(result.status) ||
        data.object !== 'password_reset' ||
        typeof data.id !== 'string' ||
        !/^password_reset_[A-Za-z0-9]{1,80}$/.test(data.id) ||
        typeof data.user_id !== 'string' ||
        !/^user_[A-Za-z0-9]{1,80}$/.test(data.user_id) ||
        typeof data.email !== 'string' ||
        data.email.toLowerCase() !== email.toLowerCase() ||
        !secret(data.password_reset_token) ||
        !/^[\x21-\x7e]{20,8192}$/.test(data.password_reset_token) ||
        !Number.isSafeInteger(expires) ||
        expires <= Date.now() ||
        expires > Date.now() + 86400000
      )
        throw denied();
      const metadata = {
        resetId: data.id,
        subject: data.user_id,
        tokenHash: createHash('sha256').update(data.password_reset_token).digest('hex'),
        expires,
      };
      try {
        await deliver(metadata, data.password_reset_token);
        return metadata;
      } catch {
        throw denied();
      } finally {
        delete data.password_reset_token;
        delete data.password_reset_url;
      }
    },
    async reset(token: string, password: string, signal: AbortSignal) {
      gate();
      if (!secret(token) || !password.length || password.length > 256) throw denied();
      const { status, data } = await post(
        '/user_management/password_reset/confirm',
        { token, new_password: password },
        signal,
      );
      const user = isRecord(data.user) ? data.user : data;
      if (
        status !== 200 ||
        typeof user.id !== 'string' ||
        !/^user_[A-Za-z0-9]+$/.test(user.id) ||
        user.email_verified !== true
      )
        throw denied();
      return user.id; // For business-only durable-session invalidation; not a new login.
    },
  });
}
